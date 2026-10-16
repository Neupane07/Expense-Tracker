import {
  Module,
  Controller,
  UseGuards,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ReviewService } from './review.service';
@Controller('review')
@UseGuards(SessionAuthGuard)
class ReviewController {
  constructor(private readonly review: ReviewService) {}
  @Get() groups(@CurrentUser() u: AuthenticatedUser, @Query() q: unknown) {
    return this.review.groups(u.id, q);
  }
  @Get('aliases') aliases(@CurrentUser() u: AuthenticatedUser) {
    return this.review.aliases(u.id);
  }
  @Post('aliases') saveAlias(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: unknown,
  ) {
    return this.review.saveAlias(u.id, b);
  }
  @Delete('aliases/:id') removeAlias(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.review.removeAlias(u.id, id);
  }
  @Post('preview') preview(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: unknown,
  ) {
    return this.review.preview(u.id, b);
  }
  @Post('apply') apply(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: unknown,
  ) {
    return this.review.apply(u.id, b);
  }
  @Post(':id/undo') undo(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.review.undo(u.id, id);
  }
}
@Module({
  imports: [AuthModule],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
