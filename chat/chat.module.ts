import { Module } from '@nestjs/common';
import { ChatGateway } from 'chat/chat.gateway';
import { DatabaseModule } from 'lib/commons/src/database/database.module';
import { Message } from 'user/src/models/message.model';

@Module({
  imports: [DatabaseModule.forfeature([Message])],
  controllers: [],
  providers: [ChatGateway],
})
export class ChatModule {}
