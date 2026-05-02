/**
 * Handlarz w mieście — sprzedaje określone surowce za złoto
 * i kupuje wszystkie surowce z plecaka gracza po `sellMultiplier × buyPrice`.
 *
 * **Zasada gry:** handlarze NIE oferują sprzętu (broń, zbroja, narzędzia).
 * Sprzęt gracz craftuje sam — handlarze tylko surowce.
 */
export interface MerchantStock {
  /** id surowca (z `ITEMS`) → cena za 1 sztukę w złocie */
  itemId: string;
  buyPrice: number;
}

export interface Merchant {
  id: string;
  name: string;
  description: string;
  stock: MerchantStock[];
  /** mnożnik ceny przy odkupie od gracza (typ. 0.4-0.6) */
  sellMultiplier: number;
}

export type Region = 1 | 2 | 3 | 4;

export abstract class City {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly region: Region;
  abstract readonly merchants: Merchant[];

  findMerchant(merchantId: string): Merchant | undefined {
    return this.merchants.find((m) => m.id === merchantId);
  }
}
