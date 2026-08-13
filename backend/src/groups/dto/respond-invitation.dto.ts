import { IsBoolean } from 'class-validator';

export class RespondInvitationDto {
  @IsBoolean()
  accept!: boolean;
}
