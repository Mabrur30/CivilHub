import {
  resetGeocodingCache,
  reverseGeocode,
  searchPlaces,
  toGeocodeResult,
} from "../services/geocoding";
import { findDistrict } from "../utils/bdLocations";
import { distanceM, jitterPoint, parseSiteInput } from "../utils/projectSite";

const fetchMock = jest.fn();

beforeEach(() => {
  resetGeocodingCache();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, json: async () => body }) as Response;

describe("district matching", () => {
  test("matches official names, suffixes and old spellings", () => {
    expect(findDistrict("Dhaka District")?.name).toBe("Dhaka");
    expect(findDistrict("Chittagong")?.name).toBe("Chattogram");
    expect(findDistrict("cox's bazar")?.division).toBe("Chattogram");
    expect(findDistrict("Bogra")?.name).toBe("Bogura");
    expect(findDistrict("Atlantis")).toBeNull();
  });
});

describe("geocoding", () => {
  test("maps Nominatim address parts to district and area", () => {
    expect(
      toGeocodeResult({
        display_name: "Mirpur 10, Dhaka",
        lat: "23.8069",
        lon: "90.3687",
        address: { suburb: "Mirpur", state_district: "Dhaka District" },
      }),
    ).toEqual({
      label: "Mirpur 10, Dhaka",
      lat: 23.8069,
      lng: 90.3687,
      district: "Dhaka",
      area: "Mirpur",
    });
  });

  test("searches Bangladesh only, sends a User-Agent and caches", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        { display_name: "Uttara", lat: "23.87", lon: "90.39", address: { county: "Dhaka" } },
      ]),
    );
    const first = await searchPlaces("Uttara sector 4");
    const second = await searchPlaces("Uttara sector 4");

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({ district: "Dhaka" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("countrycodes=bd");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^CivilHub\//);
  });

  test("skips very short searches without calling Nominatim", async () => {
    expect(await searchPlaces("ab")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("reports an unavailable service as a 502", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(reverseGeocode(23.8, 90.4)).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("site privacy", () => {
  test("the public point is 150–400 m from the site, inside the 500 m circle", () => {
    const site = { lat: 23.8069, lng: 90.3687 };
    for (let i = 0; i < 200; i += 1) {
      const distance = distanceM(site, jitterPoint(site));
      expect(distance).toBeGreaterThan(140);
      expect(distance).toBeLessThan(420);
    }
  });

  test("parses a pinned site and rejects pins outside Bangladesh", () => {
    const site = parseSiteInput({
      lat: 23.8069,
      lng: 90.3687,
      district: "Dhaka District",
      area: " Mirpur 10 ",
      utilities: ["electricity", "gas"],
    });
    expect(site).toMatchObject({
      district: "Dhaka",
      division: "Dhaka",
      area: "Mirpur 10",
      point: { type: "Point", coordinates: [90.3687, 23.8069] },
    });
    expect(() =>
      parseSiteInput({ lat: 51.5, lng: -0.12, district: "Dhaka", area: "Soho" }),
    ).toThrow(/inside Bangladesh/);
    expect(() => parseSiteInput({ district: "Dhaka", area: "Mirpur" })).toThrow(
      /Pin the site/,
    );
    expect(() =>
      parseSiteInput({ lat: 23.8, lng: 90.4, district: "Narnia", area: "X" }),
    ).toThrow(/district/);
  });
});
