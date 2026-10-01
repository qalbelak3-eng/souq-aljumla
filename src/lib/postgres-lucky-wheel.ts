import { getPostgresClient } from '@/db/client';

export interface PostgresLuckyWheelPrize {
  id: string;
  label: string;
  subLabel?: string;
  type: string;
  value: string;
  couponCode?: string;
  color: string;
  textColor: string;
  probability: number;
}

export interface PostgresLuckyWheelSettings {
  isEnabled: boolean;
  title?: string;
  subtitle?: string;
  prizes: PostgresLuckyWheelPrize[];
  [key: string]: unknown;
}

const DEFAULT_SETTINGS: PostgresLuckyWheelSettings = {
  isEnabled: true,
  prizes: [],
};

function mapPrize(row: any): PostgresLuckyWheelPrize {
  return {
    id: String(row.id),
    label: String(row.label || ''),
    subLabel: row.sub_label || undefined,
    type: String(row.type || ''),
    value: String(row.value ?? ''),
    couponCode: row.coupon_code || undefined,
    color: String(row.color || '#ffffff'),
    textColor: String(row.text_color || '#000000'),
    probability: Number(row.probability || 0),
  };
}

function normalizePrize(input: any, index: number) {
  const label = typeof input?.label === 'string' ? input.label.trim() : '';
  const type = typeof input?.type === 'string' ? input.type.trim() : '';
  const value = input?.value == null ? '' : String(input.value).trim();
  const color = typeof input?.color === 'string' ? input.color.trim() : '';
  const textColor = typeof input?.textColor === 'string' ? input.textColor.trim() : '';
  const probability = Number(input?.probability);

  if (!label || !type || !value || !color || !textColor) {
    throw new Error(`INVALID_PRIZE_${index + 1}`);
  }
  if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
    throw new Error(`INVALID_PROBABILITY_${index + 1}`);
  }

  return {
    label,
    subLabel: typeof input?.subLabel === 'string' && input.subLabel.trim() ? input.subLabel.trim() : null,
    type,
    value,
    couponCode: typeof input?.couponCode === 'string' && input.couponCode.trim() ? input.couponCode.trim() : null,
    color,
    textColor,
    probability,
  };
}

async function ensureSettingsTable() {
  const sql = getPostgresClient();
  await sql`
    CREATE TABLE IF NOT EXISTS lucky_wheel_settings (
      id integer PRIMARY KEY CHECK (id = 1),
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `;
}

export async function pgGetLuckyWheelSettings(): Promise<PostgresLuckyWheelSettings> {
  const sql = getPostgresClient();
  await ensureSettingsTable();

  const [settingsRows, prizeRows] = await Promise.all([
    sql`SELECT settings FROM lucky_wheel_settings WHERE id = 1 LIMIT 1;`,
    sql`SELECT * FROM lucky_wheel_prizes ORDER BY created_at ASC, id ASC;`,
  ]);

  const stored = settingsRows.length && settingsRows[0].settings && typeof settingsRows[0].settings === 'object'
    ? settingsRows[0].settings as Record<string, unknown>
    : {};

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    prizes: prizeRows.map(mapPrize),
  };
}

export async function pgUpdateLuckyWheelSettings(input: any): Promise<PostgresLuckyWheelSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_SETTINGS');
  if (!Array.isArray(input.prizes)) throw new Error('INVALID_PRIZES');
  if (input.prizes.length > 50) throw new Error('TOO_MANY_PRIZES');

  const prizes = input.prizes.map(normalizePrize);
  const probabilityTotal = prizes.reduce((sum: number, prize: any) => sum + prize.probability, 0);
  if (prizes.length > 0 && probabilityTotal !== 100) throw new Error('INVALID_PROBABILITY_TOTAL');

  const { prizes: _ignoredPrizes, ...settingsInput } = input;
  const safeSettings = JSON.parse(JSON.stringify(settingsInput));
  const sql = getPostgresClient();
  await ensureSettingsTable();

  await sql.begin(async tx => {
    await tx`
      INSERT INTO lucky_wheel_settings (id, settings, updated_at)
      VALUES (1, ${JSON.stringify(safeSettings)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now();
    `;

    await tx`DELETE FROM lucky_wheel_prizes;`;
    for (const prize of prizes) {
      await tx`
        INSERT INTO lucky_wheel_prizes (label, sub_label, type, value, coupon_code, color, text_color, probability)
        VALUES (${prize.label}, ${prize.subLabel}, ${prize.type}, ${prize.value}, ${prize.couponCode}, ${prize.color}, ${prize.textColor}, ${prize.probability});
      `;
    }
  });

  return pgGetLuckyWheelSettings();
}
