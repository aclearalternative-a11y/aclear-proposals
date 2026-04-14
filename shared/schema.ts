import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const proposals = sqliteTable("proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shareId: text("share_id").notNull().unique(),
  customerFirstName1: text("customer_first_name_1").notNull(),
  customerLastName1: text("customer_last_name_1").notNull(),
  customerFirstName2: text("customer_first_name_2"),
  customerLastName2: text("customer_last_name_2"),
  street: text("street").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull().default("NJ"),
  zip: text("zip").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  repName: text("rep_name").notNull(),
  waterSource: text("water_source").notNull(),
  // Water test results stored as JSON
  waterTestResults: text("water_test_results").notNull(),
  // Household info
  numPeople: integer("num_people").notNull().default(3),
  numBathrooms: integer("num_bathrooms").notNull().default(2),
  // Packages stored as JSON (array of 3 packages: good/better/best)
  packages: text("packages").notNull(),
  // Selected package tier
  selectedPackage: text("selected_package"),
  // Discount type and deposit
  discountType: text("discount_type").default("none"),
  customDiscountValue: real("custom_discount_value").default(0),
  deposit: integer("deposit").default(0),
  // Rental mode
  rentalMode: integer("rental_mode", { mode: "boolean" }).default(false),
  // Signatures stored as base64 data URLs
  customerSignature1: text("customer_signature_1"),
  customerSignature2: text("customer_signature_2"),
  repSignature: text("rep_signature"),
  // Status
  status: text("status").notNull().default("draft"),
  sentDate: text("sent_date"),
});

export const insertProposalSchema = createInsertSchema(proposals).omit({
  id: true,
});

export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;

// Equipment item type
export interface EquipmentItem {
  id: string;
  category: string;
  name: string;
  size: string;
  price: number;
  brochureUrl?: string;
  rentalPrice?: number;
  rentalInstallPrice?: number;
  sizeOptions?: { name: string; size: string; price: number; rentalPrice?: number; rentalInstallPrice?: number }[];
  currentSizeIndex?: number;
}

export interface PackageData {
  tier: string;
  label: string;
  equipment: EquipmentItem[];
  totalPrice: number;
  installationIncluded: boolean;
}

export interface WaterTestResults {
  pH?: number;
  iron: number;
  hardness: number;
  tds: number;
  copper?: number;
  chlorine?: number;
  hydrogenSulfide: boolean;
  h2sCold?: number;
  h2sHot?: number;
}
