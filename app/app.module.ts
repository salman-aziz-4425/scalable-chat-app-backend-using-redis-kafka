import { Module } from '@nestjs/common';
import { ChatModule } from 'chat/chat.module';
import { DatabaseModule } from 'lib/commons/src/database/database.module';
import { UserModule } from 'user/src/user.module';

@Module({
  imports: [DatabaseModule,UserModule,ChatModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
