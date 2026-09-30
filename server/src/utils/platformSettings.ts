import { getPaymentConfig } from "../config/payments";
import { PlatformSetting } from "../models/PlatformSetting.model";

/**
 * The commission CivilHub keeps on new payments: the rate an admin set, or
 * PLATFORM_COMMISSION_RATE (10% by default) until one has been set. Each
 * payment stores its own fee when it's created, so a change never alters
 * payments already made.
 */
export const getCommissionRate = async (): Promise<number> => {
  const setting = await PlatformSetting.findOne({ key: "platform" }).select("commissionRate").lean().exec();
  return typeof setting?.commissionRate === "number" ? setting.commissionRate : getPaymentConfig().commissionRate;
};
