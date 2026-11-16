import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ExpensesModule } from './expenses/expenses.module';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AppController } from './app.controller';
import { GroupsModule } from './groups/groups.module';
import { InvestmentsModule } from './investments/investments.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ExpensesModule,
    GroupsModule,
    InvestmentsModule,
    EmailModule
  ],
  controllers: [AppController]
})
export class AppModule {}
