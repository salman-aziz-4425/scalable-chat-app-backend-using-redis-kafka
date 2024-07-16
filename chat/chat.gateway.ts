import { SubscribeMessage, WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private connectedUsers: Map<string, string[]> = new Map();
  

  afterInit(server: Server) {
    console.log('WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    this.broadcastActiveUsers();
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.removeSocketIdFromEmail(client.id);
    this.broadcastActiveUsers();
  }

  @SubscribeMessage('user_online')
  handleUserOnline(client: Socket, payload: { email: string }): void {
    console.log(`${payload.email} is online`);

    if (!this.connectedUsers.has(payload.email)) {
      this.connectedUsers.set(payload.email, [client.id]);
    } else {
      const socketIds = this.connectedUsers.get(payload.email);
      if (socketIds && !socketIds.includes(client.id)) {
        socketIds.push(client.id);
        this.connectedUsers.set(payload.email, socketIds);
      }
    }
    this.broadcastActiveUsers();
  }

  @SubscribeMessage('user_offline')
  handleUserOffline(client: Socket, payload: { email: string }): void {
    console.log(`${payload.email} is offline`);
    this.removeSocketIdFromEmail(client.id);
    this.broadcastActiveUsers();
  }

  @SubscribeMessage('send_message')
  handleMessage(client: Socket, payload: { sender: string, recipient: string, message: string }): void {
    const { sender, recipient, message } = payload;
    const messageObject = { id: new Date().getTime(), sender, recipient, message };
    const recipientSocketIds = this.getSocketIdsByEmail(recipient);
    const senderSocketIds = this.getSocketIdsByEmail(sender);
    const recipents=recipientSocketIds?[...recipientSocketIds,...senderSocketIds]:[]
    if (recipents && recipents.length > 0) {
      recipents.forEach(socketId => {
        if(socketId!==client.id){
          this.server.to(socketId).emit('receive_message', messageObject);
        }
      });
      console.log(`Sent message to ${recipient}: ${message}`);
    } else {
      console.log(`Recipient ${recipient} is not online`);
    }
  }

  private broadcastActiveUsers(): void {
    const activeUsers = Array.from(this.connectedUsers.keys());
    console.log("users broadcasted")
    console.log(this.connectedUsers);
    this.server.emit('active_user', activeUsers);
  }

  private getSocketIdsByEmail(email: string): string[] | undefined {
    return this.connectedUsers.get(email);
  }

  private removeSocketIdFromEmail(socketId: string): void {
    for (const [email, socketIds] of this.connectedUsers.entries()) {
      const index = socketIds.indexOf(socketId);
      if (index !== -1) {
        socketIds.splice(index, 1);
        if (socketIds.length === 0) {
          this.connectedUsers.delete(email);
        } else {
          this.connectedUsers.set(email, socketIds);
        }
        break;
      }
    }
  }
}
