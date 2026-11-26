export type Voyage = {
  id: string;
  playerId: string;
  playerName: string;
  billingCountry: string;
  portId: string;
  portName: string;
  performanceCountry: string;
  vesselId: string;
  vesselName: string;
  productKey: string;
  taxLocation: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  measuredMinutes: number | null;
  status: "Active" | "Completed";
  isTest: boolean;
};

export type Voyages = { voyages: Voyage[]; canCreateTestVoyage: boolean };
