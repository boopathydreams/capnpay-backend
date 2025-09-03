import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DecentroService } from './decentro.service';
import { DecentroController } from './decentro.controller';
// import { EscrowService } from './escrow.service';

@Module({
  imports: [HttpModule],
  providers: [DecentroService], // EscrowService
  controllers: [DecentroController],
  exports: [DecentroService], // EscrowService
})
export class DecentroModule {}
