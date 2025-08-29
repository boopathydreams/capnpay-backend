import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MockUpiDirectoryService } from './upi-directory.service';

@ApiTags('UPI Directory')
@Controller('upi-directory')
export class UpiDirectoryController {
  constructor(private readonly upiDirectoryService: MockUpiDirectoryService) {}

  @Get('lookup/phone/:phone')
  @ApiOperation({
    summary: 'Lookup VPA by phone',
    description: 'Get VPA details for a phone number',
  })
  async lookupVpaByPhone(@Param('phone') phone: string) {
    return this.upiDirectoryService.lookupVpaByPhone(phone);
  }

  @Get('lookup/vpa/:vpa')
  @ApiOperation({
    summary: 'Lookup phone by VPA',
    description: 'Get phone details for a VPA',
  })
  async lookupPhoneByVpa(@Param('vpa') vpa: string) {
    return this.upiDirectoryService.lookupPhoneByVpa(vpa);
  }

  @Get('entries')
  @ApiOperation({
    summary: 'Get all directory entries',
    description: 'Get all mock directory entries for testing',
  })
  async getAllEntries() {
    return this.upiDirectoryService.getAllEntries();
  }

  @Post('entries')
  @ApiOperation({
    summary: 'Add directory entry',
    description: 'Add new phone-VPA mapping for testing',
  })
  async addEntry(
    @Body()
    entry: {
      phone: string;
      vpa: string;
      name: string;
      handle: string;
    },
  ) {
    await this.upiDirectoryService.addMapping(entry);
    return { ok: true };
  }
}
