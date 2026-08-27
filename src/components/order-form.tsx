'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { createOrder } from '@/app/actions/orders';
import {
  createOrderSchema, formDataToInput, UNASSIGNED, type FormState,
} from '@/lib/validation';
import { SERVICE_TYPE, SERVICE_TYPE_LABEL, type ServiceType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type Tech = { id: string; name: string };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs font-medium text-destructive">{errors[0]}</p>;
}

type Errors = Record<string, string[]>;

export function OrderForm({ technicians }: { technicians: Tech[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrder, null);
  const [clientErrors, setClientErrors] = useState<Errors>({});

  const serverErrors = state && !state.ok ? state.errors : {};
  // Client errors win while they exist: they describe the submit that was just
  // blocked, whereas server errors describe an older round trip.
  const errors: Errors = Object.keys(clientErrors).length ? clientErrors : serverErrors;

  // Repopulate after a failed submit; the inputs are uncontrolled, so React
  // would otherwise reset them to empty. The key on <form> forces a remount so
  // the new defaultValues actually take effect.
  const prev = state && !state.ok ? state.values : {};

  /**
   * The browser pass. Same schema and same FormData mapping as the server
   * action, imported from one module, so the two layers cannot disagree about
   * what is valid. This one exists for speed of feedback; the server one exists
   * because a direct POST never runs this code at all.
   */
  function validateOnSubmit(e: React.FormEvent<HTMLFormElement>) {
    const parsed = createOrderSchema.safeParse(formDataToInput(new FormData(e.currentTarget)));
    if (parsed.success) {
      setClientErrors({});
      return;
    }
    e.preventDefault();
    setClientErrors(parsed.error.flatten().fieldErrors as Errors);
  }

  return (
    <form
      key={JSON.stringify(prev)}
      action={action}
      onSubmit={validateOnSubmit}
      className="space-y-6"
      noValidate
    >
      {state && !state.ok && state.message && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cust_name">
            Customer name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cust_name"
            name="cust_name"
            maxLength={100}
            autoComplete="off"
            defaultValue={prev.cust_name ?? ''}
            aria-invalid={Boolean(errors.cust_name?.length)}
          />
          <FieldError errors={errors.cust_name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">
            Phone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            placeholder="012-345 6789 or 60123456789"
            autoComplete="off"
            defaultValue={prev.phone ?? ''}
            aria-invalid={Boolean(errors.phone?.length)}
          />
          <FieldError errors={errors.phone} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address">
            Address <span className="text-destructive">*</span>
          </Label>
          <Input
            id="address"
            name="address"
            autoComplete="off"
            defaultValue={prev.address ?? ''}
            aria-invalid={Boolean(errors.address?.length)}
          />
          <FieldError errors={errors.address} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="service_type">
            Service type <span className="text-destructive">*</span>
          </Label>
          <Select name="service_type" defaultValue={prev.service_type || undefined}>
            <SelectTrigger id="service_type" aria-invalid={Boolean(errors.service_type?.length)}>
              {/* base-ui renders the raw stored value unless given a formatter */}
              <SelectValue placeholder="Choose a service">
                {(v) => SERVICE_TYPE_LABEL[v as ServiceType] ?? 'Choose a service'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SERVICE_TYPE.map((s) => (
                <SelectItem key={s} value={s}>
                  {SERVICE_TYPE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={errors.service_type} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quoted_price">
            Quoted price (RM) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="quoted_price"
            name="quoted_price"
            inputMode="decimal"
            placeholder="250.00"
            defaultValue={prev.quoted_price ?? ''}
            aria-invalid={Boolean(errors.quoted_price?.length)}
          />
          <FieldError errors={errors.quoted_price} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="problem_desc">Problem description</Label>
          <Textarea
            id="problem_desc"
            name="problem_desc"
            rows={3}
            placeholder="What did the customer report?"
            defaultValue={prev.problem_desc ?? ''}
            aria-invalid={Boolean(errors.problem_desc?.length)}
          />
          <FieldError errors={errors.problem_desc} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assigned_tech">Assign technician</Label>
          <Select name="assigned_tech" defaultValue={prev.assigned_tech || UNASSIGNED}>
            <SelectTrigger id="assigned_tech">
              {/* base-ui renders the raw value unless given a formatter */}
              <SelectValue>
                {(v) =>
                  technicians.find((t) => t.id === v)?.name ?? 'Leave unassigned'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Leave unassigned</SelectItem>
              {technicians.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={errors.assigned_tech} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="admin_notes">Admin notes</Label>
          <Textarea
            id="admin_notes"
            name="admin_notes"
            rows={3}
            placeholder="Internal only."
            defaultValue={prev.admin_notes ?? ''}
            aria-invalid={Boolean(errors.admin_notes?.length)}
          />
          <FieldError errors={errors.admin_notes} />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Creating…' : 'Create order'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          nativeButton={false}
          render={<Link href="/orders" />}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
