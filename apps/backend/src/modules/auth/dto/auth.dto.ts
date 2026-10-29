import { ApiProperty } from '@nestjs/swagger';

export class DevLoginDto {
  @ApiProperty({
    example: 'alice-contributor',
    description: 'Unique username for simulated or local developer authentication',
  })
  username!: string;

  @ApiProperty({
    example: 'Alice Contributor',
    required: false,
    description: 'Display name',
  })
  displayName?: string;

  @ApiProperty({
    example: 'https://github.com/identicons/alice.png',
    required: false,
    description: 'Avatar image URL',
  })
  avatarUrl?: string;
}

export class SavePatDto {
  @ApiProperty({
    example: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
    description: 'Personal Access Token strictly associated with the authenticated user profile',
  })
  pat!: string;
}

export class CreateReportDto {
  @ApiProperty({
    example: 'Fix OAuth Expiration in Cal.com (#14280)',
    description: 'Title of the saved analysis or PR research',
  })
  title!: string;

  @ApiProperty({
    example: 'calcom/cal.com',
    description: 'Target repository coordinate',
  })
  repo!: string;

  @ApiProperty({
    example: 'scan_issue',
    description: 'Action that produced the report (e.g. scan_issue, summarise, owasp_check, draft_pr)',
  })
  action!: string;

  @ApiProperty({
    example: '# Analysis Report\n\nIdentified entrypoints in `packages/core/auth.ts`...',
    description: 'Markdown or structured content of the generated report',
  })
  content!: string;
}

export class UserProfileDto {
  @ApiProperty({ example: 'usr_abc123' })
  id!: string;

  @ApiProperty({ example: 'octocat' })
  username!: string;

  @ApiProperty({ example: 'The Octocat', required: false })
  displayName?: string;

  @ApiProperty({ example: 'https://github.com/identicons/octocat.png', required: false })
  avatarUrl?: string;

  @ApiProperty({ example: false })
  isGuest?: boolean;

  @ApiProperty({ example: true })
  githubConnected!: boolean;

  @ApiProperty({ example: false })
  googleConnected!: boolean;

  @ApiProperty({ example: true, required: false })
  hasPat?: boolean;
}

export class AuthSessionResponseDto {
  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT Bearer token for authenticating subsequent HTTP requests',
  })
  token?: string;
}
