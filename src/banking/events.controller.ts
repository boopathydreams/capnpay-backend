import { Controller, Sse, UseGuards, Query, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BankingService } from './banking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtService } from '@nestjs/jwt';

@ApiTags('Banking')
@Controller('banking')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BankingEventsController {
  constructor(
    private readonly bankingService: BankingService,
    private readonly jwtService: JwtService,
  ) {}

  @Sse('events')
  @ApiOperation({ summary: 'Server-sent events stream of payment updates for current user' })
  events(@CurrentUser() user: any): Observable<MessageEvent> {
    return this.bankingService.getUserUpdates(user.id).pipe(
      map((evt) => ({ data: evt }) as MessageEvent),
    );
  }

  // Public SSE variant for clients that cannot set headers; supply token as query param
  @Sse('events/public')
  @ApiOperation({ summary: 'SSE stream using token query param (mobile fallback)' })
  publicEvents(@Query('token') token?: string): Observable<MessageEvent> {
    if (!token) throw new UnauthorizedException('Missing token');
    try {
      const payload = this.jwtService.verify(token);
      const userId = payload?.sub;
      if (!userId) throw new UnauthorizedException('Invalid token');
      return this.bankingService.getUserUpdates(userId).pipe(
        map((evt) => ({ data: evt }) as MessageEvent),
      );
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
