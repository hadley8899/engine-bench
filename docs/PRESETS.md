# Real-engine presets

Each preset is an approximation of a real engine, calibrated to published full-load figures: a manufacturer torque curve where one was found (the Golf and the K20A), otherwise the rated peak-torque and peak-power points. It uses this model's simplifications, so it is not a replica. Nor is it a prediction of what the real engine would survive: the part limits are model estimates (see `docs/SIMULATION.md`). Every value below is marked as **sourced**, **inferred** (a plausible choice with no published figure) or **calibrated** (chosen to match the published curve).

Model 1.18.0 moves every four-stroke preset to the performance polynomial valve motion. Because no cited source gives a usable piston-pocket/valve-angle clearance model for these exact variants, each stores an **inferred effective overlap-TDC room** chosen close to the prior compression-derived assumption: AXX 4.9 mm, K20A 4.0, 4G63T 5.6, SR20DET 5.4, 4A-GE 3.9, 2JZ-GTE 5.7, RB26DETT 4.9, EJ20 5.4 and LS3 4.7. This is the simulator's one-dimensional clearance input, not a claim that a physical piston pocket has that depth. Motion changed the calibrated flow curve, so the Golf/K20 cam maps and Evo boost map were re-fitted at their documented comparison points; all other four-stroke presets were remeasured.

Model 1.22.0 selects the representative RON 100 grade for the Japanese-market K20A, 4G63T, SR20DET, 4A-GE, 2JZ-GTE, RB26DETT and EJ20. This is a rounded calibration grade: [Honda's fuel guidance](https://global.honda/en/motorcycle-aftersales/plusone/202508.html) describes Japanese high-octane petrol as RON 96 or above and its [domestic comparison](https://global.honda/jp/emc/faq.html) gives premium as in the RON 99 range, so it is not a claim that every retail fill is exactly RON 100. The presets remain inside their recorded comparison tolerances after the combustion recalibration.

## VW EA113 2.0 TFSI (AXX), Golf GTI Mk5

`frontend/src/bench/presets.ts`, added with model 1.11.0 (4 November 2026).

### Sources

1. Volkswagen, *Self-Study Programme 337: the 2.0 l FSI engine with turbocharger* (French edition, "Le moteur FSI de 2,0l à suralimentation par turbocompresseur"). It gives the specification table and the torque and power diagram S337_008 on page 6, and the cylinder-head changes on page 10. Copy read: [vag-technique.fr](https://www.vag-technique.fr/ext_files/ssp/vw/SSP_337_Le_moteur_FSI_de_2,0l_à_suralimentation_par_turbocompresseur.pdf).
2. australiancar.reviews, [*VW Mk5 Golf GTI: EA113 AXX/BWA/BPY/CAWB engines*](https://australiancar.reviews/vw-mk-5-golf-gti-ea113-axx-bwa-bpy-cawb-engines/): BorgWarner K03 turbocharger and 0.9 bar peak boost. This is a secondary source; it does not say whether that is gauge pressure, and logged values from owners' forums agree with about 0.9–1 bar gauge.
3. Replacement piston and rod listings (for example [bar-tek](https://bar-tek.com/2-0l-tfsi-high-performance-pistons-conrods-set-mahle) and [JE](https://performancebyie.com/products/je-pistons-vw-audi-20t-fsi-tsi)): 144 mm rods with 20 mm pins, as the original fitment. These are secondary sources.

Other sources list the BWA as mechanically the same. Volkswagen's later CCTA/CAEB documents (for example SSP 922903, 9.6:1, 1,700–5,000 RPM) describe different engines and were not used.

### Values

| Field | Value | Basis |
| --- | --- | --- |
| Bore × stroke, displacement | 82.5 × 92.8 mm, 1,984 cc | Sourced (1) |
| Compression | 10.5:1 | Sourced (1) |
| Rod length | 144 mm | Sourced (3) |
| Fuel and injection | RON 98, homogeneous direct injection | Sourced (1); RON 95 runs with "a slight loss of power" |
| Rated output | 147 kW at 5,700 RPM; 280 Nm at 1,800–4,700 RPM | Sourced (1) |
| Turbo | K03-sized: 46 mm compressor, 0.00022 m² turbine, 230,000 RPM rated | Size inferred from the K03; turbine area calibrated |
| Boost target | 0.9 bar | Peak boost sourced from (2); compressor-side pressure reaches 0.87–0.90 bar over most of the held plateau |
| Torque request | 170 Nm at 1,000 RPM, 239 at 1,500, 280 from 1,800–4,700, then the published curve | Calibrated from (1); the MED 9.1-style electronic throttle meters cylinder charge independently of full pedal |
| Intercooler | Effectiveness 0.55, 12 kPa drop | Inferred: a modest side-mounted cooler |
| Full-load mixture | λ 0.93 at 3,500–5,000 RPM and λ 0.88 above, from 150 kPa manifold pressure; λ 1 elsewhere (engine-management maps) | Inferred: typical production enrichment |
| Ignition | 14° BTDC with knock control | Inferred |
| Cam phasing (1.13.0; recalibrated 1.18.0) | Intake phaser, 42° range: −20° at 1,000 RPM, +3° at 1,500, −8° at 2,000, 0° from 2,500–6,000, −20° at 6,500 (all loads) | Range sourced (1); map calibrated. Profiles use performance motion |
| Valve areas, intake closing (585°), runners, burn duration, inertia | As in the file | Inferred; the SSP gives only 42° of intake cam phasing, which the model's fixed timing cannot represent |
| Rev limit / mechanical limit | 6,800 / 7,200 RPM | Inferred; the published curve runs to 7,000 RPM |
| Parts | Cast pistons, stock rods, MLS gasket, bolts, stock springs | Inferred from the SSP's description of the production parts (strengthened crank and valve seats, uprated springs relative to the NA FSI, sodium-filled exhaust valves) |
| Injectors and high-pressure pump | 450 cc/min, 130 L/h | Inferred; pump about half used at full power |

### Calibration and deviation

Steady full load in normal air (the S337_008 curve read at 500 RPM steps, against the preset held for 4 s and averaged over the last second):

| RPM | 1,000 | 1,500 | 2,000 | 2,500–4,000 | 4,500 | 5,000 | 5,500 | 6,000 | 6,500 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Published, Nm | 170 | 239 | 280 | 280 | 280 | 271 | 254 | 236 | 218 |
| Preset, Nm | 168 | 240 | 280 | 280–281 | 280 | 270 | 254 | 236 | 218 |

Model 1.20.0 restores the 0.9-bar target and adds the optional torque-request map. In five-second holds the compressor-side boost is 0.77 bar at 1,800 RPM, 0.87 at 2,000, 0.88–0.89 through 2,500–6,000 and 0.90 at 6,500; the electronic throttle settles between 84% and 91% across the 1,800–6,500 range. Held torque is 168, 240, 280, 280–281, 280, 270, 254, 236 and 218 Nm from 1,000 through 6,500 RPM. It makes 147.3 kW at 5,700 RPM against the rated 147 kW. `src/sim/presets.test.ts` holds the comparisons, and `management.test.ts` separately verifies that a torque request closes the plate while the driver remains at full pedal.

**Interpretation of boost and torque.** Before the torque-request path, forcing the preset to 0.9 bar made about 326 Nm at 4,000 RPM. The same hold already had about 65 °C charge, 1.65 bar gauge turbine-manifold back pressure and 7.3° of knock retard; at 2,000 RPM retard reached its 12° ceiling. The Evo did not show the same error at its cited boost, so model 1.20.0 does not apply a universal boost or combustion correction. It instead represents the AXX as torque-managed: boost is measured in the charge path before the throttle, while the plate closes enough to meet the requested brake torque. Bosch's torque-based control references and the model limitations are recorded in `SIMULATION.md`. The exact factory request and throttle maps are not published, so this map remains a fit to Volkswagen's output curve.

**Pushing it.** A positive manual or Push-it boost offset deliberately bypasses the production torque request, representing the torque-monitor changes required alongside a boost tune. In five-second indestructible diagnostic holds at 4,000 RPM, +0.1 bar makes about 337 Nm with 9° mean knock retard; +0.4 bar makes about 368 Nm and reaches the 12° retard ceiling. Part failure remains a model estimate, not a prediction of what a real AXX would take.

Not represented: intake manifold flaps, the dual (homogeneous split) injection used for catalyst heating, the twin catalysts' back pressure, the dual-mass flywheel, and MED 9.1 coordination beyond the boost, λ, spark, cam and torque-request maps.

## Honda K20A, Civic Type R FD2

Added with model 1.12.0 (4 November 2026). It is the only preset besides the Golf with a full manufacturer curve.

### Sources

1. Honda, archived Civic Type R (FD2) web catalogue: [specification](https://www.honda.co.jp/auto-archive/civic/type-r/2011/webcatalog/spec/) (K20A, 86.0 × 86.0 mm, 1,998 cc, 11.7:1, 165 kW [225 PS] at 8,000 RPM, 215 N·m [21.9 kgf·m] at 6,100 RPM, premium unleaded, PGM-FI) and the [engine page](https://www.honda.co.jp/auto-archive/civic/type-r/2011/webcatalog/engine/), with its engine performance curve ([graph01.gif](https://www.honda.co.jp/auto-archive/civic/type-r/2011/webcatalog/engine/image/graph01.gif)) and an 8,400 RPM redline.

### Values

| Field | Value | Basis |
| --- | --- | --- |
| Bore × stroke, compression | 86 × 86 mm, 11.7:1 | Sourced |
| Rated output | 165 kW at 8,000 RPM, 215 Nm at 6,100 RPM | Sourced |
| VTEC | High cam from 5,200 RPM: intake area 1,200 mm², exhaust 800 mm², intake closing 615°; low cam 700 mm², 680 mm², 575° | Switch speed calibrated to the curve's crossover; profiles inferred and calibrated. Since 1.13.0 these are cam profiles converted exactly |
| i-VTC (1.13.0; recalibrated 1.18.0) | Intake phaser, 50° range: −27° at 1,500 RPM, −10° at 2,500, 0° at 3,500, −25° at 4,500 around the changeover, +5° at 6,000–7,000 and −15° at 8,000 (all loads) | Range inferred; map calibrated to the curve |
| Rod length | 139 mm | Inferred (common figure; not confirmed by a source found) |
| Ignition | 12° BTDC at 1,500 RPM rising to 24° from 4,000 RPM at full load (map) | Calibrated: limits low-speed knock on representative RON 100 at 11.7:1 |
| Mixture | λ 0.92 at 4,000 RPM to 0.88 from 6,000 RPM at full load (map) | Inferred |
| Rev limit / mechanical limit | 8,600 / 9,000 RPM | Inferred from the 8,400 RPM redline |
| Fuel | Representative RON 100 Japanese premium | Sourced premium requirement; rounded model grade |

### Calibration and deviation

The curve was read from the image, so expect about ±5 Nm of reading error.

| RPM | 1,500 | 2,500 | 3,500 | 4,500 | 5,500 | 6,000 | 7,000 | 8,000 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Honda, Nm | ~160 | ~186 | ~204 | ~187 | ~208 | ~218 | ~210 | ~190 |
| Preset, Nm | 160 | 185 | 200 | 191 | 216 | 223 | 213 | 189 |

With model 1.18.0 the preset makes 160, 185, 200, 191, 216, 223, 213 and 189 Nm at those speeds: the largest deviation is +8 Nm at 5,500 RPM. The real i-VTC map is not published, so this phasing remains a fit to the curve, not Honda's calibration.

## Mitsubishi 4G63T, Lancer Evolution VIII

### Sources

1. auto-data.net and carsart.net listings for the Evolution VIII 2.0 4WD: 1,997 cc, 85 × 88 mm, 8.8:1, 280 hp, 383 Nm at 3,500 RPM. Secondary sources.
2. Peak power at 6,500 RPM appears only in secondary listings. Japanese catalogue torque is often quoted as 40.0 kgf·m (392 Nm); that was not confirmed, so the preset uses 383 Nm.

No manufacturer torque curve was found, so the preset is calibrated to the two rated points only.

### Values

| Field | Value | Basis |
| --- | --- | --- |
| Bore × stroke, compression | 85 × 88 mm, 8.8:1 | Sourced (secondary) |
| Rod length | 150 mm | Inferred |
| Turbo | TD05HR-sized: 56 mm compressor, 0.00033 m² turbine, 200,000 RPM rated | Inferred; turbine calibrated |
| Boost | 1.25 bar at 3,000 RPM, tapering to 1.05 bar at 6,500 (map) | Calibrated; similar to commonly reported Evo VIII boost |
| Mixture | λ 1 to 3,000 RPM, 0.88 at 4,000, 0.84 from 6,000 at full load (map) | Inferred |
| Intercooler | Effectiveness 0.7, 8 kPa drop | Inferred: front-mounted |
| Injectors, pump | 560 cc/min, 190 L/h | Inferred |
| Rev limit / mechanical limit | 7,200 / 7,600 RPM | Inferred |

### Calibration and deviation

With model 1.18.0 the preset makes 383 Nm at 3,500 RPM against the rated 383 Nm. At 6,500 RPM it makes 305 Nm (207.6 kW) against 302 Nm (206 kW). Between those points the shape is the model's own: 387 Nm at 2,500 RPM and 354 at 5,500. Unlike the Golf, this preset reaches its rated torque at roughly the real boost, so the model's boosted overestimate (see the Golf) is not consistent between engines. On stock parts, a boost push at 4,300 RPM cracks a cast piston at 1.4 bar above the map.

## Nissan SR20DET, Silvia S15 Spec-R

### Sources

1. goo-net-exchange.com catalogue listings for the S15 Silvia Spec-R: 86.0 × 86.0 mm, 1,998 cc, 8.5:1, 250 PS (184 kW) at 6,400 RPM, 28.0 kgf·m (275 N·m) at 4,800 RPM. The Spec-S's 225 PS figure is for the variant without the larger turbo.
2. Wikipedia's SR20DET applications table: T28BB turbocharger with VTC on the S15 Spec-R.

No manufacturer torque curve was found; calibrated to the two rated points.

### Values

| Field | Value | Basis |
| --- | --- | --- |
| Bore × stroke, compression | 86 × 86 mm, 8.5:1 | Sourced |
| Rod length | 136.3 mm | Inferred |
| Turbo | T28-sized ball bearing: 54 mm compressor, 0.0006 m² turbine | Inferred; turbine calibrated |
| Boost | 0.55 bar at 3,000 RPM, 0.58 at 4,800, 0.8 at 6,400 (map) | Calibrated |
| Mixture | λ 0.92 at 4,000 to 0.86 from 6,000 RPM at full load (map) | Inferred |
| Cam | One profile with VTC (1.13.0): the intake phaser advances 20° between 1,500 and 5,000 RPM | VTC sourced (2); its switch speeds and angle inferred |
| Boost (1.13.0) | 0.45 bar at 3,000 RPM, 0.52 at 4,800, 0.8 at 6,400 (map) | Calibrated, lowered from 1.12.0's 0.55–0.58 because VTC adds mid-range torque |
| Rev limit / mechanical limit | 7,500 / 8,000 RPM | Inferred |

### Calibration and deviation

With VTC and model 1.18.0 the preset makes 274 Nm at 4,800 RPM against the rated 275 Nm, and 278 Nm (186.0 kW) at 6,400 RPM against 274 Nm (184 kW). Its broad plateau remains the model's own because no published curve was found. On stock parts, a boost push at 4,500 RPM cracks a cast piston at 1.8 bar above the map.

## Toyota 4A-GE (16-valve), AE86

### Sources

1. AEU86, [AE86 specifications](https://aeu86.org/?p=142): 4A-GE(U), 81.0 × 77.0 mm, 1,587 cc, 9.4:1, 88 kW at 6,600 RPM and 15.2 kgf·m (149 Nm) at 5,200 RPM in the Japanese net table. European figures differ (about 122 bhp, 141 Nm at 6,000 RPM). Later 4A-GE versions had higher compression.

No manufacturer torque curve was found; calibrated to the two Japanese rated points.

### Values

| Field | Value | Basis |
| --- | --- | --- |
| Bore × stroke, compression | 81 × 77 mm, 9.4:1 | Sourced |
| Rod length | 105.5 mm | Inferred |
| Valves, intake closing, runners | 600 mm² intake and exhaust, 585°, 300 mm | Calibrated |
| Ignition | 20° BTDC, no maps | Inferred |
| Rev limit / mechanical limit | 7,600 / 8,000 RPM | Inferred |

### Calibration and deviation

With model 1.18.0, at 5,200 RPM the preset makes 150 Nm against the rated 149 Nm. At 6,600 RPM it makes 130 Nm (89.6 kW) against 127 Nm (88 kW). Not represented: T-VIS, the intake runner valve that improved low-speed torque.

## Yamaha RD350LC (4L0)

`frontend/src/bench/presets.ts`, added with model 1.14.0 (5 November 2026). The first two-stroke preset: a liquid-cooled 347 cc parallel twin. No manufacturer curve or port timing was found, so only the rated power point is calibrated.

### Sources

1. Wikipedia, [*Yamaha RD350LC*](https://en.wikipedia.org/wiki/Yamaha_RD350LC) (revision of 25 May 2026): 347 cc parallel-twin two-stroke, 64 × 54 mm, 6.2:1, 49 bhp (37 kW), 1980–1982 models codenamed 4L0. The infobox figures carry no citation.
2. Shannons, [*1980 Yamaha RD350LC: Race Developed*](https://www.shannons.com.au/club/bike-news/bike-reviews/1980-yamaha-rd350lc-race-developed/): claimed 47 hp at 8,500 RPM (it also lists a 64.8 mm bore, taken as a typing error against the other sources).
3. 2smoto, [model note on the RD350 YPVS](https://www.2smoto.com/m_news.asp?id=8222): Yamaha's compression figures for these engines are corrected (trapped) ratios, calculated from exhaust-port closing.

### Values

| Field | Value | Basis |
| --- | --- | --- |
| Layout, bore × stroke, capacity | Parallel twin, 64 × 54 mm, 347 cc | Sourced (1) |
| Compression | 6.2:1 trapped; 10.7:1 full stroke | Trapped sourced (1, 3); full-stroke ratio follows from the inferred exhaust port |
| Rated output | 35 kW (47 hp) at 8,500 RPM | Sourced (2); (1) gives 37 kW without a speed |
| Crank | 180° | Inferred (common for the type; not stated in the sources) |
| Intake | Reed valves, 1,600 mm² open, 500 Hz petals | Inferred |
| Carburettors | One 28 mm carburettor per cylinder | Inferred |
| Ports | Exhaust opens 87° ATDC (186°), bridged, 60 mm; five transfers open 116° ATDC (128°), 85 mm total | Inferred, typical road-twin timing; widths calibrated |
| Expansion chambers | 1.0 m from the port to the stinger (1.2 m overall), tuned near 9,200 RPM by the round-trip rule | Calibrated |
| Rod length, ignition (18° BTDC), burn, λ 0.9, inertia, primary compression 1.35, limits | As in the file | Inferred |

### Calibration and deviation

Steady full load in normal air, held 2 s and averaged over the last second:

| RPM | 4,000 | 5,500 | 7,000 | 7,500 | 8,000 | 8,500 | 9,000 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Preset, Nm | 22.1 | 23.6 | 25.8 | 31.9 | 38.0 | 37.1 | 35.0 |
| Preset, kW | 9.3 | 13.6 | 18.9 | 25.1 | 31.8 | 33.1 | 33.0 |

Model 1.14.1 (the pipe backflow fix) moved these by up to 1.2 Nm; 1.14.0 made 33.4 kW at 8,500 RPM. At 8,500 RPM the preset makes 33.1 kW against the claimed 35 kW (−5.4%); `src/sim/presets.test.ts` holds it within 6% and 4 Nm of the rated point. The torque comes on sharply above 7,000 RPM, as the chambers start to work, which matches the bike's reputation but has not been checked against a measured curve. Highest part stress over the range is 63% of its limit.

Not represented: the YPVS power valve (later models), the separate oil injection, auxiliary exhaust ports and the airbox. The model's two-stroke scavenging constants are estimates (see `docs/SIMULATION.md`).

## Yamaha DT125R

`frontend/src/bench/presets.ts`, added with model 1.14.1 (5 November 2026, user request). A liquid-cooled 124 cc reed-valve trail single in its restricted (learner) tune, the form the published figures describe. No manufacturer curve or port timing was found; two rated points are calibrated.

### Sources

1. Ultimate Specs, [*2002 Yamaha DT 125 R*](https://www.ultimatespecs.com/motorcycles-specs/yamaha/yamaha-dt-125-r-2002): 124 cc, 56.0 × 50.7 mm, 6.7:1, 10.3 kW (14.1 hp) and 14.2 Nm at 7,000 RPM, dry 116 kg.
2. Yamaha DT125RE/DT125X owner's manual, specifications page ([ManualsLib](https://www.manualslib.com/manual/611222/Yamaha-Dt125r.html?page=67)): liquid-cooled two-stroke, 56.0 × 50.7 mm, 6.70:1, Mikuni TM28 carburettor, primary 71/22 (3.227), final 57/16 (3.563), first to fourth gears 2.833, 1.875, 1.412, 1.143.
3. MotorcycleSpecs, [*1990 Yamaha DT125R*](https://www.motorcyclespecs.co.za/model/yamaha/yamaha_dt125r%2090.htm) (and the identical [moto-data 1992–93 listing](https://moto-data.net/yamaha/dt-125r-1992-1993)): reed valve, 10.3 kW (14 hp) and 15.2 Nm at 6,500 RPM, top speed 124.6 km/h. Its 56 × 50 mm, 6.8:1 and VM24 carburettor disagree with (1) and (2) and are taken as an earlier or garbled listing.
4. MotorcycleSpecs, [*1998 Yamaha DT 125RE*](https://www.motorcyclespecs.co.za/model/yamaha/yamaha_dt125r%2098.htm): reed valve, Mikuni 28 SS, 10.8 kW at 7,000 RPM, 16.3 Nm at 7,000 RPM.

As with the RD350LC (source 3 there), the 6.7:1 is taken as Yamaha's trapped ratio from exhaust closing.

### Values

| Field | Value | Basis |
| --- | --- | --- |
| Layout, bore × stroke, capacity | Single, 56.0 × 50.7 mm, 124.9 cc | Sourced (1, 2) |
| Compression | 6.7:1 trapped; 11.1:1 full stroke | Trapped sourced (1, 2); full-stroke ratio follows from the inferred exhaust port |
| Rated output | 10.3 kW and 14.2 Nm at 7,000 RPM; 15.2 Nm at 6,500 RPM | Sourced (1, 3) |
| Intake | Reed valve, 1,100 mm² open, 500 Hz petals | Reed sourced (3, 4); size inferred |
| Carburettor | One 28 mm | Sourced (2, 4) |
| Power valve | Lowers the port 3 mm below 6,500 RPM | Inferred: the DT125R is widely reported with Yamaha's YPVS, but none of the cited pages states it |
| Ports | Exhaust opens 90° ATDC (181°), 41 mm, unbridged; five transfers open 117° ATDC (126°), 70 mm total | Inferred, mild trail timing; calibrated |
| Expansion chamber | 1.13 m from the port to the stinger, with a 34 mm header | Calibrated |
| Rod length (100 mm), ignition (16° BTDC), burn, λ 0.9, inertia, primary compression 1.35, limits (9,000 RPM limiter) | As in the file | Inferred |

How the restriction was made (a smaller exhaust or carburettor, or a different power-valve setting) is not stated in the sources; the preset reaches the restricted figures through mild port timing and a pipe tuned low, not by modelling a restrictor.

### Calibration and deviation

Steady full load in normal air, held 2 s and averaged over the last second:

| RPM | 3,000 | 4,000 | 5,000 | 6,000 | 6,500 | 7,000 | 7,500 | 8,000 | 8,500 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Preset, Nm | 10.0 | 12.4 | 10.6 | 14.0 | 15.3 | 13.6 | 14.6 | 13.5 | 7.9 |
| Preset, kW | 3.2 | 5.2 | 5.6 | 8.8 | 10.4 | 9.9 | 11.5 | 11.3 | 7.0 |

At 6,500 RPM it makes 15.3 Nm (published 15.2); at 7,000 RPM 13.6 Nm and 9.9 kW against 14.2 Nm and 10.3 kW (−4%). `src/sim/presets.test.ts` holds both points within 3 Nm and the power within 6%. The model's power peaks at 7,500 RPM (11.5 kW), above the published rating, then falls sharply past 8,000 RPM as the pipe goes off tune; the curve between the rated points has not been checked against a measurement. Highest part stress over the range is 61% of its limit. Road load picks the 125 trail bike for it, whose gearing is close to the manual's (first gear 2.833, overall 10 against the manual's 11.5).

Not represented: the restrictor itself, the separate oil injection, the airbox and the electric start's own behaviour.

## Racing two-strokes: Yamaha YZ125 and YZ250, Aprilia RS125

`frontend/src/bench/presets.ts`, added 5 November 2026 and recalibrated with model 1.19.0's tuned charging path on 6 November. They now target the full published comparison figures rather than the earlier 65–70% shares. Geometry and speeds follow the sources where available; auxiliary widths, scavenging, primary compression and pipe cones remain inferred/calibrated. Matching these points does not make the presets replicas or validate the curve between them.

### Sources

1. Yamaha Motor Corporation USA, [2023 YZ250 specifications](https://yamahamotorsports.com/models/23-yz250/specs): 66.4 × 72.0 mm, 8.9–10.6:1, Keihin PWK38S carburettor, reed valve, five speeds; no power. The YZ125's 54.0 × 54.5 mm and 8.2–10.1:1 (8.6–10.7:1 for 2005 models) are Yamaha's figures as quoted in search listings of its [YZ125 specifications](https://yamahamotorsports.com/models/25-yz125/specs); that page was not read directly.
2. Dirt Bike magazine, [*125 2-strokes on the dyno: the wrap*](https://dirtbikemagazine.com/125-2-strokes-on-the-dyno-the-wrap/) (2024, Pro Circuit dyno): YZ125 35.78 hp (26.7 kW) at 11,670 RPM and 16.47 lb-ft (22.3 Nm) at 10,940 RPM. Whether this is at the crank or the wheel is not stated; it is used as published.
3. Wikipedia, [*Yamaha YZ125*](https://en.wikipedia.org/wiki/Yamaha_YZ125) (revision of 6 October 2026): reed valve, liquid cooled since 1981, 38 mm carburettor, 33–35 hp from Motocross Action's 2016 shootout.
4. Wikipedia, [*Yamaha YZ250*](https://en.wikipedia.org/wiki/Yamaha_YZ250) (revision of 6 October 2026): 66.4 × 72 mm from 1999, mechanical YPVS, reed block in the cylinder, 47 hp (35 kW) at 8,800 RPM and 41.5 Nm at 7,500 RPM, 9,000 RPM redline. The power figures' source is a Motocross Action page that does not show them, so treat them as unverified.
5. Wikipedia, [*Aprilia RS125*](https://en.wikipedia.org/wiki/Aprilia_RS125) (revision of 18 May 2026): Rotax 124.8 cc liquid-cooled single, 54.0 × 54.5 mm, 21.0 kW (28.2 bhp, Aprilia technical sheet) and 19.0 Nm (Motorcycle News); no speeds, model year or compression ratio.

Yamaha's compression ranges are taken as trapped ratios, as for the RD350LC and DT125R.

### Values

| Field | YZ125 | YZ250 | RS125 | Basis |
| --- | --- | --- | --- | --- |
| Bore × stroke | 54.0 × 54.5 mm | 66.4 × 72.0 mm | 54.0 × 54.5 mm | Sourced (1, 4, 5) |
| Trapped compression | 8.6:1 | 8.9:1 | 8.0:1 | YZ sourced (1), the low end of each range; RS inferred |
| Carburettor | 38 mm | 38 mm | 34 mm | YZ sourced (1, 3); RS inferred (a Dell'Orto VHSB 34 is reported for 2003–04 bikes) |
| Intake | Reed, 2,400 mm², 550 Hz | Reed, 2,800 mm², 500 Hz | Reed, 1,600 mm², 600 Hz | YZ reed sourced (1, 3, 4); sizes and the RS reed inferred |
| Power valve | 4 mm below 8,500 RPM | 5 mm below 6,000 RPM | 4 mm below 8,000 RPM | YZ250's YPVS sourced (4); the rest inferred |
| Ports | Exhaust 26.5 mm from the deck (opens 81° ATDC), 56 mm bridged + 20 mm auxiliary; five transfers, 85 mm total | Exhaust 37.5 mm (84° ATDC), 69 mm bridged + 20 mm auxiliary; five transfers, 95 mm | Exhaust 28 mm (84° ATDC), 55 mm bridged + 12 mm auxiliary; five transfers, 76 mm | Inferred, typical racing timing; calibrated |
| Primary compression | 1.5 | 1.65 | 1.4 | Inferred and calibrated |
| Expansion chamber | Tuned near 11,700 RPM | Tuned near 8,700 RPM | Tuned near 10,900 RPM | Calibrated to the published peak speeds |
| Limiter | 12,500 RPM | 9,000 RPM (the redline, 4) | 11,800 RPM | YZ250 sourced; others inferred |
| Rod, ignition (16° BTDC), burn, λ 0.88, RON 98, inertia | As in the file | | | Inferred |

The auxiliary value is total effective flow width, not the physical chord of one window. The YZ250 uses a two-angle baffle cone to broaden its calibrated band between the torque and power points.

### Calibration and deviation

Steady full load in normal air, held 2 s and averaged over the last second (model / published):

| Preset | Torque | Power |
| --- | --- | --- |
| YZ125 | 21.2 Nm at 11,000 RPM / 22.3 Nm at 10,940 | 26.8 kW at 11,500 RPM / 26.7 kW at 11,670 |
| YZ250 | 40.4 Nm at 7,500 RPM / 41.5 Nm | 33.1 kW at 8,800 RPM / 35 kW |
| RS125 | 18.9 Nm at 10,500 RPM / 19.0 Nm | 20.8 kW at 10,500 RPM / 21.0 kW |

The RS125's speed is inferred: 21 kW and 19 Nm meet at about 10,500 RPM. `src/sim/presets.test.ts` holds all three to the full comparison figures: torque within 2, 3 and 1.5 Nm and power within 6%. The YZ250's 33.1 kW is 5.4% below the weakly sourced 35 kW figure and inside that declared tolerance. Road load picks the 125 race bike for the two 125s and the road motorcycle for the YZ250.

Not represented: the auxiliary ports' individual heights/shapes, the power valves' real mechanisms (a lowered main-port edge stands in), the YZ250's five-speed and the bikes' own gearing, electronic ignition maps, and Aprilia's restricted versions.

## Stage 11 engines: sixes, boxer and V8

Added with model 1.15.0. All use the ordinary cylinder model; there is no preset-only torque multiplier. Twin turbochargers are represented by one equivalent lumped turbo because the induction model has one shaft.

### Toyota 2JZ-GTE — Supra RZ

Toyota's [1993 A80 Supra launch release](https://global.toyota/en/detail/7868203) gives a 3.0-litre inline-six, sequential twin turbos, 206 kW at 5,600 RPM and 44.0 kg-m (431 Nm) at 3,600 RPM. Bore × stroke (86.0 × 86.0 mm), 8.5:1 compression and the 1–5–3–6–2–4 order come from Toyota repair manual RM502U; rod length is inferred. Valve areas, runner, single equivalent turbo, intercooler, maps, inertia and limits are calibrated estimates. With model 1.18.0 it makes 441.6 Nm at 3,600 RPM (+10.6) and 204.9 kW at 5,600 RPM (−1.1). Sequential changeover is not represented.

### Nissan RB26DETT — Skyline GT-R R34

Nissan's [Heritage Collection R34](https://www.nissan-global.com/EN/HERITAGE_COLLECTION/280_skyline_gt-r_v-spec_ii.html) gives 2,568 cc, inline-six DOHC twin turbo, 206 kW at 6,800 RPM and 392 Nm at 4,400 RPM. Bore × stroke (86.0 × 73.7 mm), 8.5:1 compression and 1–5–3–6–2–4 come from Nissan's R34 service manual; the geometry calculates to 2,568.7 cc while Nissan labels it 2,568. Rod length, breathing, equivalent turbo and maps are inferred/calibrated. With model 1.18.0 it makes 398.4 Nm at 4,400 RPM (+6.4) and 202.6 kW at 6,800 RPM (−1.7%). The individual ceramic turbos and six-throttle intake are not represented.

### Subaru EJ20 — Impreza WRX STI

Subaru's [31 October 2000 release](https://www.subaru.co.jp/news/archives/00_10_12/10_31_1.html) gives a 1,994 cc turbo boxer-four, 92.0 × 75.0 mm, 8.0:1, 206 kW at 6,400 RPM and 373 Nm at 4,000 RPM. It also identifies AVCS. Rod length, valve events/areas, turbo and maps are inferred/calibrated; the present preset does not reproduce a published cam map. With model 1.18.0 it makes 387.2 Nm at 4,000 RPM (+14.2) and 200.8 kW at 6,400 RPM (−2.5%). Unequal header lengths and bank-specific pulses are not solved, so its familiar exhaust note is only approximated by firing order and the synthesiser.

### GM LS3 6.2 V8

Chevrolet Performance's [LS3 specification](https://www.chevrolet.com/performance-parts/crate-engines/ls-lsx-engines/ls3-engine) gives a 6.2-litre Gen IV V8, 103.25 × 92.0 mm, 10.7:1, 430 hp (321 kW) at 5,900 RPM, 425 lb-ft (576 Nm) at 4,600 RPM and a 6,600 RPM maximum recommendation. It also specifies hypereutectic pistons and powdered-metal rods; the preset leaves the simulator's generic stock-part limits because those are model estimates. Rod length, effective valve areas/events and exhaust are inferred/calibrated. With model 1.18.0 it makes 584.5 Nm at 4,600 RPM (+8.5) and 309.1 kW at 5,900 RPM (−3.7%). The cross-plane 1–8–4–3–6–5–7–2 order is represented; pushrods, the real hydraulic-roller cam and bank-specific four-primary collectors are not.

`src/sim/presets.test.ts` holds the four rated points to their stated tolerances and checks displacement, no failure and less than 95% estimated stress. Full published curves were not found for these exact specifications, so the interface describes them as calibrated approximations rather than replicas.

## Stage 11 two-stroke V-twins

### Aprilia RS250

Aprilia's [factory service and repair manual](https://www.abikingworld.com/manuals/aprilia/assets/files/Aprilia_RS250-Repair_manual_1998.pdf) specifies a 249 cc 90° V-twin, 56.0 × 50.6 mm, reed induction, exhaust valves, liquid cooling and two Mikuni TM34SS carburettors. The quoted 12.0:1 ratio is used as the full-stroke model ratio. Port sizes/timing, pipe cones, rod, primary compression, ignition and limits are inferred/calibrated. Model 1.19.0 makes 40.5 Nm and 46.6 kW at 11,000 RPM against the commonly published 45 kW unrestricted figure. The rated line deliberately gives only the factory-manual facts because the manual does not publish power.

### Honda RS250R

No readable Honda/HRC period specification was found. The preset therefore uses the consistently reported 90° V-twin, 54.0 × 54.5 mm geometry and period output of roughly 63 kW as secondary evidence; [this documented 1997 machine](https://racingsm.org/hondars.php) reports the geometry, over 85 hp and a 13,500 RPM maximum. Every port, pipe, intake, 1.85 primary compression, 40° burn duration and calibration value is explicitly inferred. Model 1.19.0 makes 45.2 Nm and 59.2 kW at 12,500 RPM, 6.0% below the period comparison figure and inside the declared tolerance.

Both V-twins fire 90° then 270° apart, draw two animated banks and run a separate simulated chamber per cylinder. `src/sim/presets.test.ts` now holds each to the full stated comparison figure rather than a reduced share. The figures remain point calibrations with largely inferred port and pipe geometry.
