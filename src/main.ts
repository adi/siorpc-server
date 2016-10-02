import * as http from 'http';
import * as ioserver from 'socket.io';

export type ReturnFunction = (returnedValue: any, thrownException: any) => any;
export type CodeFunction = (returnMethod: ReturnFunction, args: any[]) => void;
export type EventFunction = (...args: any[]) => void;

class DeclaredMethod {
  name: string;
  code: CodeFunction;
  constructor(name: string, code: CodeFunction) {
    this.name = name;
    this.code = code;
  }
}
interface CookieAndArgs {
  cookie: string;
  args: any[];
}
interface ReturnedValueAndThrownException {
  returnedValue: any;
  thrownException: any;
}

export class SioRpcServer {

  io: SocketIO.Server;
  connectedSockets: SocketIO.Socket[];
  private declaredMethods: DeclaredMethod[];

  constructor(httpServer: http.Server) {
    this.io = ioserver(httpServer);
    this.connectedSockets = [];
    this.declaredMethods = [];
  }
  declare(methodName: string, methodCode: Function) {
    this.declaredMethods.push(
      new DeclaredMethod(
        methodName,
        async (returnFunction, args) => {
          let result: any;
          try {
            result = await methodCode.apply(null, args);
          } catch (exception) {
            return returnFunction(undefined, exception);
          }
          return returnFunction(result, undefined);
        }
      )
    );
  }
  publish(eventName: string, ...args: any[]) {
    for (const connectedSocket of this.connectedSockets) {
      connectedSocket.emit(`${eventName}..event`, args);
    }
  }
  run() {
    this.io.on('connection', (socket) => {
      // Remember this socket
      this.connectedSockets.push(socket);
      socket.on('disconnect', () => {
        // Forget this socket
        const socketIndex = this.connectedSockets.indexOf(socket);
        if (socketIndex !== -1) {
          this.connectedSockets.splice(socketIndex, 1);
        }
      });
      // Make all declared methods available on this socket
      for (const declaredMethod of this.declaredMethods) {
        socket.on(`${declaredMethod.name}..call`, (cookieAndArgs: CookieAndArgs) => {
          const returnMethod = (value: any, exception: Error) => {
            const returnedValue = value;
            let thrownException: any;
            if (typeof exception !== 'undefined') {
              thrownException = {
                remote_name: exception.name,
                remote_message: exception.message,
                remote_stack: exception.stack,
              };
            }
            const returnedValueAndThrownException = <ReturnedValueAndThrownException> { returnedValue, thrownException };
            socket.emit(`${declaredMethod.name}..return..${cookieAndArgs.cookie}`, returnedValueAndThrownException);
          };
          declaredMethod.code(returnMethod, cookieAndArgs.args);
        });
      }
    });
  }

}
