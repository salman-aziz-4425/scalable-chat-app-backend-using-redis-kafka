import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { User } from 'user/src/models/user.model';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env',
      })],
      useFactory: async (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DATABASE_HOST'),
        port: parseInt(configService.get<string>('DATABASE_PORT'), 10),
        username: configService.get<string>('DATABASE_USERNAME'),
        password: configService.get<string>('DATABASE_PASSWORD'),
        database: configService.get<string>('DATABASE_NAME'),
        synchronize: true,
        entities: [
           User,
          ],
          ssl: {
            rejectUnauthorized: false,
            ca: configService.get<string>('DATABASE_SSL_CA'),
            key: configService.get<string>('DATABASE_SSL_KEY'),
            cert: configService.get<string>('DATABASE_SSL_CERT'),
          },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {
    static forfeature(models:EntityClassOrSchema[]){
      return TypeOrmModule.forFeature(models)
    }
}