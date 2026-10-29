import { ApiProperty } from '@nestjs/swagger';

export class ExportDocumentDto {
  @ApiProperty({
    description: 'Document title for the exported Google Doc or Markdown file',
    example: 'OpenSourced Research: facebook/react Architecture & Security Audit',
  })
  title!: string;

  @ApiProperty({
    description: 'Markdown content of the analysis to be exported',
    example: '# facebook/react Architecture\n\n## Overview\nModular monorepo architecture...',
  })
  content!: string;
}
