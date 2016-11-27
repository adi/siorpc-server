import * as http from 'http';
import * as ioserver from 'socket.io';

export type ReturnFunction = (returnedValue: any, thrownException: any) => any;
export type CodeFunction = (returnMethod: ReturnFunction, args: any[]) => Promise<void>;

interface ReturnedValueAndThrownException {
  returnedValue: any;
  thrownException: any;
}

export class SioRpcServer {

  io: SocketIO.Server;
  connectedSockets: SocketIO.Socket[];
  private declaredMethods: { [id: string]: CodeFunction };

  constructor(httpServer: http.Server) {
    this.io = ioserver(httpServer);
    this.connectedSockets = [];
    this.declaredMethods = {};
  }
  declare(methodName: string, methodCode: Function) {
    this.declaredMethods[methodName] =
        async (returnFunction: ReturnFunction, args: any[]) => {
          let result: any;
          try {
            result = await methodCode.apply(null, args);
          } catch (exception) {
            return returnFunction(undefined, exception);
          }
          return returnFunction(result, undefined);
        };
  }
  publish(eventName: string, ...args: any[]) {
    for (const connectedSocket of this.connectedSockets) {
      connectedSocket.emit(eventName, args);
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
      socket.on('call', (args: any[], returnCallback: Function) => {
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
          if (typeof returnCallback === "function") {
            returnCallback(returnedValueAndThrownException);
          }
        };
        const methodName = args.shift();
        if ({}.hasOwnProperty.call(this.declaredMethods, methodName)) {
          this.declaredMethods[methodName](returnMethod, args);
        } else {
          if (typeof returnCallback === "function") {
            const exception = new Error(`Method '${methodName}' is not declared`);
            let thrownException: any;
            if (typeof exception !== 'undefined') {
              thrownException = {
                remote_name: exception.name,
                remote_message: exception.message,
                remote_stack: exception.stack,
              };
            }
            const returnedValueAndThrownException = <ReturnedValueAndThrownException> { thrownException };
            returnCallback(returnedValueAndThrownException);
          }
        }
      });
    });
  }

}
