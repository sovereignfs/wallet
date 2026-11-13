'use client';

import { useState } from 'react';
import { Alert, Button, Checkbox, FormField, Input, Select, Textarea } from '@sovereignfs/ui';
import { CodeView } from '../barcode/CodeView';
import {
  CARD_COLORS,
  CARD_TYPES,
  type Card,
  type CardColor,
  type CardType,
  payloadProblem,
} from '../core/entries';
import { COLOR_NAMES, TYPE_NAMES } from './cardColors';
import styles from './Cards.module.css';
import screens from './Screens.module.css';

/**
 * The form of a card (DESIGN.md §13.1): its name, type and colour, the number printed under the code, and the notes. The code itself is the payload: it is
 * shown as it will be drawn, and a payload that cannot be a code is refused with the reason, as it is typed.
 */
export function CardForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  editPayload = true,
}: {
  initial: Card;
  submitLabel: string;
  onSubmit: (card: Card) => Promise<void>;
  onCancel?: () => void;
  /** The code is shown and can be changed; when false it is only shown. */
  editPayload?: boolean;
}) {
  const [card, setCard] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { shape, body } = card;
  const problem = payloadProblem(body.format, body.payload);

  const setShape = (change: Partial<typeof shape>) =>
    setCard({ ...card, shape: { ...shape, ...change } });
  const setBody = (change: Partial<typeof body>) =>
    setCard({ ...card, body: { ...body, ...change } });

  return (
    <form
      className={screens.stack}
      onSubmit={async (event) => {
        event.preventDefault();
        if (shape.title.trim() === '') return setError('A card needs a name.');
        if (problem) return setError(problem);
        setError(null);
        setBusy(true);
        try {
          await onSubmit({ shape: { ...shape, title: shape.title.trim() }, body });
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : 'The card was not saved.');
          setBusy(false);
        }
      }}
    >
      {error ? <Alert variant="error">{error}</Alert> : null}
      {body.payload !== '' && !problem ? (
        <div className={styles.preview}>
          <CodeView payload={body.payload} label="The code of this card" />
        </div>
      ) : null}
      {editPayload ? (
        <FormField
          label="What the code says"
          hint="The text inside the QR code, exactly as scanned."
          error={body.payload !== '' ? problem : undefined}
        >
          {(field) => (
            <Textarea
              {...field}
              rows={2}
              spellCheck={false}
              autoComplete="off"
              value={body.payload}
              onChange={(event) => setBody({ payload: event.target.value })}
            />
          )}
        </FormField>
      ) : null}
      <FormField label="Name" required>
        {(field) => (
          <Input
            {...field}
            autoComplete="off"
            value={shape.title}
            onChange={(event) => setShape({ title: event.target.value })}
          />
        )}
      </FormField>
      <FormField label="Type">
        {(field) => (
          <Select
            {...field}
            value={shape.cardType}
            onChange={(event) => setShape({ cardType: event.target.value as CardType })}
          >
            {CARD_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_NAMES[type]}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <fieldset className={styles.swatches} role="radiogroup" aria-label="Colour">
        {CARD_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={shape.color === color}
            aria-label={COLOR_NAMES[color]}
            className={`${styles.swatch} ${styles[color]}`}
            onClick={() => setShape({ color: color as CardColor })}
          />
        ))}
      </fieldset>
      <FormField label="Number shown under the code" hint="If it is not the same as the code.">
        {(field) => (
          <Input
            {...field}
            autoComplete="off"
            value={body.display}
            onChange={(event) => setBody({ display: event.target.value })}
          />
        )}
      </FormField>
      <FormField label="Card number">
        {(field) => (
          <Input
            {...field}
            autoComplete="off"
            value={body.cardNumber}
            onChange={(event) => setBody({ cardNumber: event.target.value })}
          />
        )}
      </FormField>
      <FormField label="Notes">
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            value={body.notes}
            onChange={(event) => setBody({ notes: event.target.value })}
          />
        )}
      </FormField>
      <Checkbox
        checked={shape.favourite}
        onChange={(favourite) => setShape({ favourite })}
        label="Favourite"
      />
      <div className={screens.row}>
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
