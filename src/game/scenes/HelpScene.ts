/**
 * Help overlay — game manual with sections.
 * Accessible via H key from MainMapScene.
 */
import Phaser from "phaser";
import { SHIP_CLASSES, type ShipClassDef } from "../../core/data/ships.ts";
import { visionRangeForMast } from "../render/WorldRenderer.ts";
import { txt } from "../ui/textStyle.ts";

type HelpSection = "controls" | "ships" | "sailing" | "world";

export class HelpScene extends Phaser.Scene {
  private currentSection: HelpSection = "controls";

  constructor() {
    super({ key: "HelpScene" });
  }

  create(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    // Backdrop
    const backdrop = this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.7);
    backdrop.setInteractive();

    // Panel — fill most of screen
    const pw = Math.min(900, cam.width - 60);
    const ph = Math.min(620, cam.height - 60);
    this.add.rectangle(cx, cy, pw + 4, ph + 4, 0x1a1a2e).setDepth(1);
    this.add.rectangle(cx, cy, pw, ph, 0x0a0a1a, 0.97).setDepth(2);
    const border = this.add.graphics().setDepth(3);
    border.lineStyle(2, 0xc8a84e, 0.8);
    border.strokeRect(cx - pw / 2, cy - ph / 2, pw, ph);

    // Title
    this.add.text(cx, cy - ph / 2 + 14, "POMOC", {
      ...txt(20, { bold: true, color: "#c8a84e" }),
    }).setOrigin(0.5, 0).setDepth(5);

    // Tab buttons
    const tabs: { label: string; key: HelpSection }[] = [
      { label: "Sterowanie", key: "controls" },
      { label: "Statki", key: "ships" },
      { label: "Żeglowanie", key: "sailing" },
      { label: "Świat", key: "world" },
    ];
    const tabY = cy - ph / 2 + 50;
    const tabW = (pw - 60) / tabs.length;
    tabs.forEach((tab, i) => {
      const tx = cx - pw / 2 + 30 + i * tabW + tabW / 2;
      const isActive = tab.key === this.currentSection;
      const bg = this.add.rectangle(tx, tabY, tabW - 8, 28, isActive ? 0x334455 : 0x1a1a2e).setDepth(4);
      bg.setStrokeStyle(1, isActive ? 0xc8a84e : 0x333333);
      bg.setInteractive();
      bg.on("pointerdown", () => {
        this.currentSection = tab.key;
        this.scene.restart();
      });
      this.add.text(tx, tabY, tab.label, {
        ...txt(14, { bold: isActive, color: isActive ? "#ffdd88" : "#888888" }),
      }).setOrigin(0.5, 0.5).setDepth(5);
    });

    // Content area
    const contentY = tabY + 24;
    const contentH = ph - 100;
    const left = cx - pw / 2 + 24;
    const right = cx + pw / 2 - 24;

    switch (this.currentSection) {
      case "controls": this.renderControls(left, contentY, right); break;
      case "ships": this.renderShips(left, contentY, right, contentH); break;
      case "sailing": this.renderSailing(left, contentY, right); break;
      case "world": this.renderWorld(left, contentY, right); break;
    }

    // Close hint
    this.add.text(cx, cy + ph / 2 - 14, "H lub ESC aby zamknąć", {
      ...txt(10, { color: "#555555" }),
    }).setOrigin(0.5, 1).setDepth(5);

    this.input.keyboard?.on("keydown-ESC", () => this.close());
    this.input.keyboard?.on("keydown-H", () => this.close());
  }

  private close(): void {
    this.scene.resume("MainMapScene");
    this.scene.stop();
  }

  private renderControls(left: number, y: number, _right: number): void {
    y += 10;
    const lines = [
      ["W / ↑", "Podnieś żagle (następny poziom)"],
      ["S / ↓", "Zwiń żagle (poprzedni poziom)"],
      ["A / ←", "Skręć w lewo (przytrzymaj)"],
      ["D / →", "Skręć w prawo (przytrzymaj)"],
      ["E", "Wejdź do portu / Wsiądź na statek"],
      ["SPACE", "Menu opcji"],
      ["H", "Pomoc (ten ekran)"],
      ["G", "Pokaż/ukryj siatkę"],
      ["V", "Pokaż/ukryj strefę widzenia"],
      ["Scroll", "Zmień zoom (1×–12×)"],
      ["Klik na miasto", "Informacje o mieście"],
    ];
    for (const [key, desc] of lines) {
      this.add.text(left, y, key, { ...txt(15, { bold: true, color: "#ffdd88" }) }).setDepth(5);
      this.add.text(left + 140, y, desc, { ...txt(14, { color: "#cccccc" }) }).setDepth(5);
      y += 26;
    }
  }

  private renderShips(left: number, y: number, right: number, contentH: number): void {
    y += 8;
    // Header — max knots = speedBase × peakWindMod(1.5) × displayMultiplier(32)
    const cols = [0, 105, 160, 215, 265, 310, 365, 425, 500, 565, 630, 710];
    const headers = ["Statek", "Max kn", "Skręt", "Kadłub", "Żagle", "Armaty", "Ładunek", "Załoga", "Wiatr°", "Luneta", "Tonaż", "Ożaglow."];
    headers.forEach((h, i) => {
      this.add.text(left + cols[i], y, h, { ...txt(10, { bold: true, color: "#888888" }) }).setDepth(5);
    });
    y += 20;

    // Separator
    const g = this.add.graphics().setDepth(4);
    g.lineStyle(1, 0x444444, 0.5);
    g.lineBetween(left, y, right, y);
    y += 4;

    // Ship rows
    for (const ship of Object.values(SHIP_CLASSES) as ShipClassDef[]) {
      if (y > contentH + 80) break;
      const maxKnots = (ship.speedBase * 1.5 * 32).toFixed(0);
      const vision = Math.round(visionRangeForMast(ship.mastHeight));
      this.add.text(left + cols[0], y, ship.name, { ...txt(11, { bold: true, color: "#ffdd88" }) }).setDepth(5);
      this.add.text(left + cols[1], y, `${maxKnots}`, { ...txt(11, { color: "#88cc88" }) }).setDepth(5);
      this.add.text(left + cols[2], y, `${(ship.turnRate * 100).toFixed(0)}°`, { ...txt(11, { color: "#88bbee" }) }).setDepth(5);
      this.add.text(left + cols[3], y, `${ship.hullMax}`, { ...txt(11, { color: "#cccccc" }) }).setDepth(5);
      this.add.text(left + cols[4], y, `${ship.sailsMax}`, { ...txt(11, { color: "#cccccc" }) }).setDepth(5);
      this.add.text(left + cols[5], y, `${ship.cannons}`, { ...txt(11, { color: "#cc8888" }) }).setDepth(5);
      this.add.text(left + cols[6], y, `${ship.cargoCap}t`, { ...txt(11, { color: "#ccaa66" }) }).setDepth(5);
      this.add.text(left + cols[7], y, `${ship.crewMin}-${ship.crewMax}`, { ...txt(11, { color: "#cccccc" }) }).setDepth(5);
      this.add.text(left + cols[8], y, `${ship.minWindAngle}°`, { ...txt(11, { color: "#ee8844" }) }).setDepth(5);
      this.add.text(left + cols[9], y, `${vision}`, { ...txt(11, { color: "#66ccff" }) }).setDepth(5);
      this.add.text(left + cols[10], y, `${ship.tonnage}t`, { ...txt(11, { color: "#aaaaaa" }) }).setDepth(5);
      this.add.text(left + cols[11], y, ship.rigType, { ...txt(11, { color: "#aaaaaa" }) }).setDepth(5);
      y += 22;
    }
  }

  private renderSailing(left: number, y: number, _right: number): void {
    y += 10;
    const lines = [
      { title: "Kierunek wiatru", desc: "Kompas pokazuje skąd wieje wiatr. Strzałka = kierunek." },
      { title: "Martwa strefa", desc: "Nie można płynąć bezpośrednio pod wiatr. Kąt zależy od statku (35°–60°)." },
      { title: "Hals (close hauled)", desc: "Tuż za martwą strefą. Wolno, ale możliwe. Najlepsza do bicia pod wiatr." },
      { title: "Baksztag (beam reach)", desc: "~90° do wiatru. NAJSZYBSZY punkt żeglowania (150% prędkości bazowej)." },
      { title: "Z wiatrem (running)", desc: "Wiatr w rufę. ~90-110% prędkości, ale nie najszybciej." },
      { title: "Poziomy żagli", desc: "W/S zmienia: Zwinięte → Zrefowane → Połowa → Pełne. Zmiana trwa 2s." },
      { title: "Typ ożaglowania", desc: "Fore-and-aft (slup): bliżej pod wiatr (35°). Square (galeon): dalej (60°)." },
      { title: "Luneta", desc: "Zasięg widzenia zależy od wysokości masztów statku. Wyższy maszt = dalej widzisz." },
    ];
    for (const { title, desc } of lines) {
      this.add.text(left, y, title, { ...txt(15, { bold: true, color: "#ffdd88" }) }).setDepth(5);
      y += 22;
      this.add.text(left + 12, y, desc, { ...txt(13, { color: "#aaaaaa" }), wordWrap: { width: 750 } }).setDepth(5);
      y += 28;
    }
  }

  private renderWorld(left: number, y: number, _right: number): void {
    y += 10;
    const lines = [
      { title: "Karaiby, XVII wiek", desc: "45 portów, 5 frakcji: Hiszpania, Anglia, Francja, Holandia, Piraci. 9 klas statków." },
      { title: "Ery gry", desc: "1560–1700. Każda era ma inny układ sił i wydarzenia historyczne." },
      { title: "Porty", desc: "Kliknij miasto na mapie aby zobaczyć informacje. Podejdź blisko aby wejść." },
      { title: "Handel", desc: "Kupuj tanio towary eksportowe, sprzedawaj drogo w portach z popytem." },
      { title: "Reputacja", desc: "Każda frakcja pamięta twoje czyny. Wrogość = trudniejszy dostęp do portów." },
    ];
    for (const { title, desc } of lines) {
      this.add.text(left, y, title, { ...txt(15, { bold: true, color: "#ffdd88" }) }).setDepth(5);
      y += 22;
      this.add.text(left + 12, y, desc, { ...txt(13, { color: "#aaaaaa" }), wordWrap: { width: 750 } }).setDepth(5);
      y += 28;
    }
  }
}
