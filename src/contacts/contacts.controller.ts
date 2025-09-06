import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all user contacts with relationship data' })
  @ApiResponse({
    status: 200,
    description: 'List of contacts with trust scores and metrics',
  })
  async getUserContacts(@Request() req) {
    const userId = req.user.id;
    return await this.contactsService.getUserContacts(userId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search contacts by name, phone, or VPA' })
  @ApiResponse({ status: 200, description: 'Filtered list of contacts' })
  async searchContacts(@Request() req, @Query('q') query: string) {
    const userId = req.user.id;
    return await this.contactsService.searchContacts(userId, query);
  }

  @Get(':contactVpa/insights')
  @ApiOperation({ summary: 'Get relationship insights for a specific contact' })
  @ApiResponse({
    status: 200,
    description: 'Comprehensive relationship analysis',
  })
  async getContactInsights(
    @Request() req,
    @Param('contactVpa') contactVpa: string,
  ) {
    try {
      console.log(
        '🔍 ContactInsights - User:',
        req.user?.id,
        'VPA:',
        contactVpa,
      );
      const userId = req.user?.id;
      if (!userId) {
        throw new Error('User ID not found in request');
      }
      return await this.contactsService.getContactInsights(userId, contactVpa);
    } catch (error) {
      console.error('❌ ContactInsights Error:', error.message);
      throw error;
    }
  }

  @Get(':contactVpa/transactions')
  @ApiOperation({ summary: 'Get transaction history with a specific contact' })
  @ApiResponse({
    status: 200,
    description: 'List of transactions with the contact',
  })
  async getContactTransactions(
    @Request() req,
    @Param('contactVpa') contactVpa: string,
  ) {
    try {
      console.log(
        '📊 ContactTransactions - User:',
        req.user?.id,
        'VPA:',
        contactVpa,
      );
      const userId = req.user?.id;
      if (!userId) {
        throw new Error('User ID not found in request');
      }
      return await this.contactsService.getContactTransactions(
        userId,
        contactVpa,
      );
    } catch (error) {
      console.error('❌ ContactTransactions Error:', error.message);
      throw error;
    }
  }

  @Get(':contactVpa/suggestions')
  @ApiOperation({ summary: 'Get smart suggestions for payments to a contact' })
  @ApiResponse({ status: 200, description: 'AI-powered payment suggestions' })
  async getSmartSuggestions(
    @Request() req,
    @Param('contactVpa') contactVpa: string,
  ) {
    try {
      console.log(
        '💡 SmartSuggestions - User:',
        req.user?.id,
        'VPA:',
        contactVpa,
      );
      const userId = req.user?.id;
      if (!userId) {
        throw new Error('User ID not found in request');
      }
      return await this.contactsService.getSmartSuggestions(userId, contactVpa);
    } catch (error) {
      console.error('❌ SmartSuggestions Error:', error.message);
      throw error;
    }
  }

  @Post(':contactVpa/relationship/update')
  @ApiOperation({ summary: 'Update contact relationship after a transaction' })
  @ApiResponse({
    status: 200,
    description: 'Relationship data updated successfully',
  })
  async updateContactRelationship(
    @Request() req,
    @Param('contactVpa') contactVpa: string,
    @Body()
    updateData: {
      transactionAmount: number;
      transactionType: 'sent' | 'received';
      transactionStatus: 'success' | 'failed';
    },
  ) {
    const userId = req.user.id;
    return await this.contactsService.updateContactRelationship(
      userId,
      contactVpa,
      updateData.transactionAmount,
      updateData.transactionType,
      updateData.transactionStatus,
    );
  }
}
