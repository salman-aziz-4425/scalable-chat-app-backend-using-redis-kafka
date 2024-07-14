import { Module } from '@nestjs/common';
import { ChatGateway } from 'chat/chat.gateway';
import { ChatModule } from 'chat/chat.module';
import { DatabaseModule } from 'lib/commons/src/database/database.module';
import { UserModule } from 'user/src/user.module';

@Module({
  imports: [DatabaseModule,UserModule,ChatModule],
  controllers: [],
  providers: [ChatGateway],
})
export class AppModule {}
