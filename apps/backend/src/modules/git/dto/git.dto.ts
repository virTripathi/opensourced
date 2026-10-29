import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OpenFolderPickerDto {
  @ApiProperty({
    description: 'Repository name used to propose default destination directory',
    example: 'react',
  })
  repoName!: string;
}

export class CloneRepositoryRequestDto {
  @ApiProperty({
    description: 'Canonical git clone URL',
    example: 'https://github.com/facebook/react.git',
  })
  repoUrl!: string;

  @ApiProperty({
    description: 'Repository owner',
    example: 'facebook',
  })
  owner!: string;

  @ApiProperty({
    description: 'Repository name',
    example: 'react',
  })
  repo!: string;

  @ApiPropertyOptional({
    description: 'Target filesystem directory path chosen via native folder picker',
    example: '~/Projects/react',
  })
  destinationPath?: string;

  @ApiPropertyOptional({
    description: 'Whether to open VS Code upon successful cloning',
    example: true,
    default: true,
  })
  autoOpenVsCode?: boolean;
}

export class CancelCloneDto {
  @ApiPropertyOptional({
    description: 'Target directory of the active clone operation to cancel and clean up',
    example: '~/Projects/calcom',
  })
  targetPath?: string;

  @ApiPropertyOptional({
    description: 'Repository URL of the active clone to cancel',
    example: 'https://github.com/calcom/cal.com.git',
  })
  repoUrl?: string;

  @ApiPropertyOptional({
    description: 'Repository name',
    example: 'cal.com',
  })
  repo?: string;
}
