import { BadRequestException } from '@nestjs/common';
import { TutorsService } from '../src/tutors/tutors.service';

describe('TutorsService hourlyRate validation', () => {
  it('rejects negative hourlyRate in updateMe', async () => {
    const prismaMock: any = {
      tutor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tutor-1',
          userId: 'user-1',
          user: { id: 'user-1' },
        }),
      },
      $transaction: jest.fn(),
    };

    const uploadsServiceMock: any = {
      toReadableReference: jest.fn().mockResolvedValue(null),
    };

    const service = new TutorsService(prismaMock, uploadsServiceMock);

    await expect(
      service.updateMe('user-1', 'tutor-1', { hourlyRate: -500 }),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
