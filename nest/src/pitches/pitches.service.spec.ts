import { Test, TestingModule } from '@nestjs/testing';
import { PitchesService } from './pitches.service.js';

describe('PitchesService', () => {
  let service: PitchesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PitchesService],
    }).compile();

    service = module.get<PitchesService>(PitchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
