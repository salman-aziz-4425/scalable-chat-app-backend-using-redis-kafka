import { Module } from '@nestjs/common';
import { ChatGateway } from 'chat/chat.gateway';
import { DatabaseModule } from 'lib/commons/src/database/database.module';
import { Message } from 'user/src/models/message.model';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [DatabaseModule.forfeature([Message])],
  controllers: [ChatController],
  providers: [ChatGateway,ChatService],
})
export class ChatModule {}
