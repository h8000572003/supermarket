import type { CommandError } from '../sim/game';

export const ERROR_MESSAGES: Record<CommandError, string> = {
  'out-of-bounds': '超出店面範圍',
  'overlaps-fixture': '與其他設施重疊',
  'blocks-entrance': '不能擋住入口',
  'access-blocked': '取用格在店外或被擋住',
  'covers-access': '會壓住其他設施的取用格',
  unreachable: '會讓某些取用格無法從入口走到',
  'not-prep-phase': '只能在準備階段操作',
  'insufficient-funds': '資金不足',
  'unknown-fixture': '找不到這個設施',
};

export const formatMoney = (n: number) => `$${n.toLocaleString('zh-TW')}`;
