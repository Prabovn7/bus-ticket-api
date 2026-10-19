import { describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test/http";
import { listCities, searchTrips } from "./catalog";

describe("catalog", () => {
  it("listCities chama /api/cities", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal("fetch", fetchMock);
    await listCities();
    expect(fetchMock).toHaveBeenCalledWith("/api/cities", undefined);
  });

  it("searchTrips monta a URL com origem, destino e data e repassa o sinal", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await searchTrips(1, 4, "2026-10-19", controller.signal);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trips?origin=1&destination=4&date=2026-10-19",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
