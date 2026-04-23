import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';

export const DATABASE_CLIENT = 'DATABASE_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('app.database.url');
        return postgres(url!, {
          max: 10,
          idle_timeout: 30,
          connect_timeout: 10,
        });
      },
    },
  ],
  exports: [DATABASE_CLIENT],
})
export class DatabaseModule {}