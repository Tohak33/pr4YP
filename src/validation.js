export const validName = value => /^(?:[А-ЯЁ][а-яё]{1,30}|[A-Z][a-z]{1,30})(?:[ -](?:[А-ЯЁ][а-яё]{1,30}|[A-Z][a-z]{1,30})){1,2}$/.test(value.trim());
export const validPhone = value => /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(value);
// Маска показывает конкретный российский формат и не допускает более десяти цифр.
export function formatPhone(input) {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('7') || digits.startsWith('8')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return '+7 ';
  let value = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 3) value += ') ';
  if (digits.length > 3) value += digits.slice(3, 6);
  if (digits.length > 6) value += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) value += `-${digits.slice(8, 10)}`;
  return value;
}
