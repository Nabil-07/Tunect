import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

const CUID_REGEX = /^c[a-z0-9]{24}$/;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IsCuidOptions = {
  allowLegacyUuid?: boolean;
};

export function IsCuid(
  options?: IsCuidOptions,
  validationOptions?: ValidationOptions,
) {
  const resolvedOptions: IsCuidOptions = options
    ? { allowLegacyUuid: true, ...options }
    : { allowLegacyUuid: true };

  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCuid',
      target: object.constructor,
      propertyName,
      constraints: [resolvedOptions],
      options: {
        message: `${propertyName} must be a valid CUID`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          const [{ allowLegacyUuid } = { allowLegacyUuid: true }] = args.constraints as [IsCuidOptions?];
          if (CUID_REGEX.test(value)) return true;
          if (allowLegacyUuid && UUID_V4_REGEX.test(value)) return true;
          return false;
        },
      },
    });
  };
}
