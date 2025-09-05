import {
  Body,
  Controller,
  Get,
  Put,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  UpdateUserProfileDto,
  UpdateUserSettingsDto,
  UserProfileResponseDto,
} from './dto/users.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({
    summary: 'Get user profile',
    description: 'Get complete user profile with settings and categories',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserProfileResponseDto,
  })
  async getUserProfile(@CurrentUser() user: any) {
    return this.usersService.getUserProfile(user.id);
  }

  @Put('profile')
  @ApiOperation({
    summary: 'Update user profile',
    description: 'Update user profile information',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: UserProfileResponseDto,
  })
  async updateUserProfile(
    @CurrentUser() user: any,
    @Body() updateData: UpdateUserProfileDto,
  ) {
    return this.usersService.updateUserProfile(user.id, updateData);
  }

  @Put('settings')
  @ApiOperation({
    summary: 'Update user settings',
    description: 'Update user preferences and settings',
  })
  @ApiResponse({
    status: 200,
    description: 'Settings updated successfully',
  })
  async updateUserSettings(
    @CurrentUser() user: any,
    @Body() settingsData: UpdateUserSettingsDto,
  ) {
    return this.usersService.updateUserSettings(user.id, settingsData);
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete user account',
    description: 'Permanently delete user account and all associated data',
  })
  @ApiResponse({
    status: 204,
    description: 'Account deleted successfully',
  })
  async deleteUserAccount(@CurrentUser() user: any) {
    return this.usersService.deleteUserAccount(user.id);
  }
}
