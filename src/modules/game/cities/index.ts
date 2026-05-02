import { City } from './city.js';
import { PortCykada } from './port-cykada.city.js';
import { Oakhaven } from './oakhaven.city.js';
import { KrasnoludzkaTwierdza } from './krasnoludzka-twierdza.city.js';
import { CzarnaCytadela } from './czarna-cytadela.city.js';

export { City };
export type { Merchant, MerchantStock, Region } from './city.js';

export const CITIES: Record<string, City> = {
  port_cykada: new PortCykada(),
  oakhaven: new Oakhaven(),
  krasnoludzka_twierdza: new KrasnoludzkaTwierdza(),
  czarna_cytadela: new CzarnaCytadela(),
};

export function getCity(id: string): City | undefined {
  return CITIES[id];
}

export function listCities(): City[] {
  return Object.values(CITIES);
}
