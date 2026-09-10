import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { shipmentSchema, type Shipment } from '@qqe/shared';

interface ShipmentFormProps {
  defaultShipment?: Shipment;
  busy: boolean;
  onSubmit: (shipment: Shipment) => void;
}

const DEFAULT_SHIPMENT: Shipment = {
  origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
  destination: { countryCode: 'GB', postcode: 'SW1A 1AA' },
  parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
};

type FormValues = {
  origin: { countryCode: string; postcode: string; timezone: string };
  destination: { countryCode: string; postcode: string };
  parcel: { weightKg: number; lengthCm: number; widthCm: number; heightCm: number };
};

interface FieldDef {
  name: keyof FormValues | string;
  label: string;
  placeholder?: string;
}

const ORIGIN_FIELDS: FieldDef[] = [
  { name: 'origin.countryCode', label: 'Origin country code', placeholder: 'US' },
  { name: 'origin.postcode', label: 'Origin postcode', placeholder: '10001' },
  { name: 'origin.timezone', label: 'Origin timezone (IANA)', placeholder: 'America/New_York' },
];

const DESTINATION_FIELDS: FieldDef[] = [
  { name: 'destination.countryCode', label: 'Destination country code', placeholder: 'GB' },
  { name: 'destination.postcode', label: 'Destination postcode', placeholder: 'SW1A 1AA' },
];

const PARCEL_FIELDS: FieldDef[] = [
  { name: 'parcel.weightKg', label: 'Weight (kg)', placeholder: '5' },
  { name: 'parcel.lengthCm', label: 'Length (cm)', placeholder: '30' },
  { name: 'parcel.widthCm', label: 'Width (cm)', placeholder: '20' },
  { name: 'parcel.heightCm', label: 'Height (cm)', placeholder: '10' },
];

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ' +
  'aria-invalid:border-red-500';

function FieldGroup({
  legend,
  fields,
  register,
  errors,
}: {
  legend: string;
  fields: FieldDef[];
  register: ReturnType<typeof useForm<FormValues>>['register'];
  errors: ReturnType<typeof useForm<FormValues>>['formState']['errors'];
}) {
  function fieldError(path: string): string | undefined {
    const parts = path.split('.');
    let cursor: Record<string, unknown> = errors as unknown as Record<string, unknown>;
    for (const part of parts) {
      cursor = (cursor[part] as Record<string, unknown>) ?? {};
    }
    const message = cursor.message;
    return typeof message === 'string' ? message : undefined;
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {legend}
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ name, label, placeholder }) => {
          const id = `shipment-${name.replace(/\./g, '-')}`;
          const error = fieldError(name);
          return (
            <div key={name} className={name === 'origin.timezone' ? 'col-span-2' : undefined}>
              <label htmlFor={id} className="block text-sm font-medium text-slate-700">
                {label}
              </label>
              <input
                id={id}
                type="text"
                inputMode={name.startsWith('parcel.') ? 'decimal' : undefined}
                placeholder={placeholder}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={INPUT_CLASS}
                {...register(name as never)}
              />
              {error ? (
                <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ShipmentForm({ defaultShipment, busy, onSubmit }: ShipmentFormProps) {
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: (defaultShipment ?? DEFAULT_SHIPMENT) as unknown as FormValues,
  });

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(values as unknown as Shipment))}
      className="space-y-5"
      noValidate
    >
      <FieldGroup legend="Origin" fields={ORIGIN_FIELDS} register={register} errors={formState.errors} />
      <FieldGroup legend="Destination" fields={DESTINATION_FIELDS} register={register} errors={formState.errors} />
      <FieldGroup legend="Parcel" fields={PARCEL_FIELDS} register={register} errors={formState.errors} />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? 'Quoting…' : 'Get quotes'}
      </button>
    </form>
  );
}