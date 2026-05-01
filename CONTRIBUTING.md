# Contributing Guide

Thank you for your interest in contributing to the Video Translation project! This guide will help you get started.

## Code of Conduct

Be respectful, inclusive, and professional in all interactions.

---

## Getting Started

### 1. Fork & Clone
```bash
git clone https://github.com/your-username/Video-Translation-with-NestJS.git
cd Video-Translation-with-NestJS
git remote add upstream https://github.com/original-owner/Video-Translation-with-NestJS.git
```

### 2. Set Up Development Environment
```bash
# Backend
cd apps/api
cp .env.example .env
npm install

# Frontend
cd ../web
cp .env.example .env.local
npm install

# Infrastructure
cd ../..
docker-compose up -d
```

### 3. Start Development Servers
```bash
# Terminal 1: API
cd apps/api
npm run start:dev

# Terminal 2: Frontend
cd apps/web
npm run dev

# Terminal 3: Monitor infrastructure
docker-compose logs -f
```

---

## Development Workflow

### Branch Naming
- Feature: `feature/description`
- Bug fix: `fix/description`
- Docs: `docs/description`

Example:
```bash
git checkout -b feature/add-batch-processing
```

### Commit Messages
Use clear, descriptive commit messages:

```
✨ feat: Add support for batch video processing
  - Implement concurrent job handling
  - Add progress tracking for multiple jobs
  - Update API to accept job list

🐛 fix: Resolve SSE connection memory leak
  - Use finalize() operator for cleanup
  - Properly unsubscribe from Redis

📝 docs: Update README with deployment guide

🔧 chore: Update dependencies to latest versions
```

**Prefix types:**
- ✨ `feat:` – New feature
- 🐛 `fix:` – Bug fix
- 🎨 `style:` – Code style (formatting, semicolons, etc.)
- ♻️ `refactor:` – Code refactor (no behavior change)
- ⚡ `perf:` – Performance improvement
- ✅ `test:` – Test additions/fixes
- 📝 `docs:` – Documentation
- 🔧 `chore:` – Dependencies, tooling, CI/CD

### Code Style

#### Backend (NestJS/TypeScript)
```typescript
// Use descriptive names
const translationService = new TranslationService();

// Use strict typing
async getJob(jobId: string): Promise<JobDto> {
  // implementation
}

// Leverage NestJS decorators
@Controller('jobs')
@UseGuards(WorkerGuard)
export class JobsController {
  @Get(':id')
  async getJob(@Param('id') jobId: string) {}
}

// Structured logging
this.logger.warn({
  msg: 'Translation API rate limit approaching',
  remaining: 50,
  limit: 1000,
});
```

**Linting & Formatting:**
```bash
# Check code style
npm run lint

# Auto-fix style issues
npm run lint -- --fix

# Format code
npm run format
```

#### Frontend (Next.js/React)
```typescript
// Functional components with TypeScript
interface ProgressTrackerProps {
  jobId: string;
  onComplete?: () => void;
}

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  jobId,
  onComplete,
}) => {
  // implementation
};

// Use React hooks
const useJobProgress = (jobId: string) => {
  const [progress, setProgress] = useState(0);
  // implementation
  return { progress };
};

// CSS Modules or Tailwind
<div className="flex items-center justify-between bg-gray-50 p-4">
  {/* content */}
</div>
```

#### Python (Pipeline)
```python
# Type hints
def run_pipeline(config: PipelineConfig) -> PipelineContext:
    """
    Run the 7-stage video translation pipeline.
    
    Args:
        config: Pipeline configuration
        
    Returns:
        PipelineContext with completed paths
        
    Raises:
        SilentAudioError: If no speech detected
        TranscriptTooShortError: If transcript < 10 chars
    """
    # implementation

# Docstrings for classes and functions
class TranscribeSegmentStage:
    """
    Stage 2: Transcribe audio with faster-whisper.
    
    Uses Silero VAD to detect speech boundaries and segment audio
    into phrases. Selects a 3-10s reference chunk for voice cloning.
    """
```

---

## Testing

### Backend

```bash
# Unit tests
npm test

# Watch mode (re-run on file changes)
npm test -- --watch

# Coverage report
npm test -- --coverage

# E2E tests
npm run test:e2e
```

**Test structure:**
```typescript
describe('JobsService', () => {
  let service: JobsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [JobsService, MockJobRepository],
    }).compile();
    service = module.get<JobsService>(JobsService);
  });

  it('should return job by id', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';
    const result = await service.getJob(jobId);
    expect(result.jobId).toEqual(jobId);
  });
});
```

### Frontend

```bash
# Run tests (if configured)
npm test

# Manual testing via browser
# Navigate to http://localhost:3001
# Test: upload video → track progress → download result
```

### Integration Tests

Test API endpoints with a real (or test) database:

```bash
cd apps/api
npm run test:e2e
```

---

## Submitting Changes

### 1. Create Pull Request

```bash
# Push your branch
git push origin feature/your-feature

# Create PR on GitHub
# Title: Clear, descriptive title
# Description: 
#   - What does this change?
#   - Why is it needed?
#   - Any breaking changes?
#   - Screenshots (for UI changes)
```

### 2. PR Checklist
- [ ] Code follows style guide (run `npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] No console errors or warnings
- [ ] Documentation is updated (if needed)
- [ ] Commit messages are clear
- [ ] No hardcoded secrets or credentials

### 3. Code Review

Maintainers will review your PR and may request changes. Be responsive and collaborative.

---

## Adding Features

### New API Endpoint

1. **Create controller method:**
```typescript
// modules/example/example.controller.ts
@Post('translate')
async translate(@Body() dto: TranslateDto) {
  return await this.exampleService.translate(dto);
}
```

2. **Create service:**
```typescript
// modules/example/example.service.ts
@Injectable()
export class ExampleService {
  async translate(dto: TranslateDto): Promise<TranslateResponse> {
    // implementation
  }
}
```

3. **Create DTO (Data Transfer Object):**
```typescript
// modules/example/dto/translate.dto.ts
import { IsString } from 'class-validator';

export class TranslateDto {
  @IsString()
  text: string;

  @IsString()
  targetLanguage: string;
}
```

4. **Add tests:**
```typescript
describe('ExampleService', () => {
  it('should translate text', async () => {
    const result = await service.translate({
      text: 'Hello',
      targetLanguage: 'hi',
    });
    expect(result.translated).toBeDefined();
  });
});
```

5. **Update module:**
```typescript
// modules/example/example.module.ts
@Module({
  controllers: [ExampleController],
  providers: [ExampleService],
})
export class ExampleModule {}
```

### New Pipeline Stage

1. **Create stage class:**
```python
# worker/pipeline/stages/my_stage.py
class MyStage:
    STAGE = 'stage_N_my_stage'
    
    def run(self, ctx: PipelineContext) -> PipelineContext:
        ctx.tick(self.STAGE)
        # implementation
        return ctx
```

2. **Integrate into pipeline:**
```python
# main_video_translation_pipeline.ipynb
class VideoTranslationPipeline:
    def run(self) -> PipelineContext:
        # ... existing stages ...
        MyStage().run(ctx)
        # ... rest of stages ...
```

3. **Add progress tracking:**
```python
# Report progress via NestJS API
post_progress(job_id, 70, 'stage_N_my_stage', 'Processing...')
```

---

## Bug Reports

Found a bug? Please report it:

1. **Check existing issues** – Don't duplicate
2. **Create detailed report:**
   - Title: Clear description
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots (if applicable)
   - System info (OS, Node version, Python version, etc.)

**Example:**
```markdown
## Bug: SSE connection drops after 5 minutes

### Steps to Reproduce
1. Upload a video
2. Open browser DevTools (Network tab)
3. Watch SSE connection
4. After ~5 minutes, connection closes

### Expected
Connection stays open until job completes

### Actual
Connection closes with 408 error

### Environment
- Browser: Chrome 120.0
- OS: macOS 14.2
- API: NestJS 11.0.1
```

---

## Documentation

Help improve documentation:

1. **Update README.md** if user-facing features change
2. **Update ARCHITECTURE.md** if internal design changes
3. **Add code comments** for complex logic
4. **Keep examples current** – test them before committing

```markdown
# Good documentation

Bad:
  # do stuff
  async function doStuff(data) {
    return process(data);
  }

Good:
  /**
   * Process translation data and return result.
   * 
   * @param data - TranslateData with text and target language
   * @returns Promise<TranslateResult> with translated text
   * @throws {InvalidLanguageError} if targetLanguage not supported
   */
  async function translate(data: TranslateData): Promise<TranslateResult> {
    // implementation
  }
```

---

## Setting Up Pre-commit Hooks (Optional)

Automatically lint and format before committing:

```bash
# Install Husky
npm install husky --save-dev
npx husky install

# Add pre-commit hook
echo "npm run lint && npm run format" > .husky/pre-commit
chmod +x .husky/pre-commit
```

Now `npm run lint` runs automatically before each commit.

---

## Questions?

- **GitHub Issues** – Bug reports and feature requests
- **Discussions** – Questions and ideas
- **Pull Requests** – Code contributions

---

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md (if created)
- GitHub contributors page
- Release notes (for significant contributions)

Thank you for contributing! 🎉
