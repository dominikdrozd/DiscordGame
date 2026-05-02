import { City } from './city.js';
import { PortCicada } from './port-cicada.city.js';
import { Oakhaven } from './oakhaven.city.js';
import { DwarvenFortress } from './dwarven-fortress.city.js';
import { BlackCitadel } from './black-citadel.city.js';

export { City };
export type { Merchant, MerchantStock, Region } from './city.js';

export const CITIES: Record<string, City> = {
  port_cykada: new PortCicada(),
  oakhaven: new Oakhaven(),
  krasnoludzka_twierdza: new DwarvenFortress(),
  czarna_cytadela: new BlackCitadel(),
};

export function getCity(id: string): City | undefined {
  return CITIES[id];
}

export function listCities(): City[] {
  return Object.values(CITIES);
}
