# Real-engine presets

Each preset is an approximation of a real engine, calibrated to published full-load figures: a manufacturer torque curve where one was found (the Golf and the K20A), otherwise the rated peak-torque and peak-power points. It uses this model's simplifications, so it is not a replica. Nor is it a prediction of what the real engine would survive: the part limits are model estimates (see `docs/SIMULATION.md`). Every value below is marked as **sourced**, **inferred** (a plausible choice with no published figure) or **calibrated** (chosen to match the published curve).

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
| Boost target | 0.6 bar | Calibrated; the real engine runs about 0.9 bar (2) |
| Intercooler | Effectiveness 0.55, 12 kPa drop | Inferred: a modest side-mounted cooler |
| Full-load mixture | λ 0.93 at 3,500–5,000 RPM and λ 0.88 above, from 150 kPa manifold pressure; λ 1 elsewhere (engine-management maps) | Inferred: typical production enrichment |
| Ignition | 14° BTDC with knock control | Inferred |
| Cam phasing (1.13.0) | Intake phaser, 42° range: −20° at 1,000 RPM, +20° at 1,500, +5° at 2,000, 0° from 2,500 (all loads) | Range sourced (1); map calibrated. Profiles are the calibrated fixed events converted exactly |
| Valve areas, intake closing (585°), runners, burn duration, inertia | As in the file | Inferred; the SSP gives only 42° of intake cam phasing, which the model's fixed timing cannot represent |
| Rev limit / mechanical limit | 6,800 / 7,200 RPM | Inferred; the published curve runs to 7,000 RPM |
| Parts | Cast pistons, stock rods, MLS gasket, bolts, stock springs | Inferred from the SSP's description of the production parts (strengthened crank and valve seats, uprated springs relative to the NA FSI, sodium-filled exhaust valves) |
| Injectors and high-pressure pump | 450 cc/min, 130 L/h | Inferred; pump about half used at full power |

### Calibration and deviation

Steady full load in normal air (the S337_008 curve read at 500 RPM steps, against the preset held for 4 s and averaged over the last second):

| RPM | 1,000 | 1,500 | 2,000 | 2,500–4,000 | 4,500 | 5,000 | 5,500 | 6,000 | 6,500 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Published, Nm | 170 | 239 | 280 | 280 | 280 | 271 | 254 | 236 | 218 |
| Preset, Nm | 192 | 224 | 283 | 283–287 | 277 | 266 | 253 | 235 | 211 |

With model 1.13.0's intake phasing the preset makes 172 Nm at 1,000 RPM, 244 at 1,500 and 288 at 2,000; above that it is unchanged. The RMS deviation fell from about 9 to 5 Nm, and every point is within 8 Nm. Before phasing (1.11.0), the largest deviations were +22 Nm at 1,000 RPM and −15 Nm at 1,500, where the model's turbo spools later and its naturally aspirated torque is higher. A standard 1,500–6,600 RPM sweep reaches 148.6 kW at about 6,070 RPM and 289 Nm at 3,650 RPM; in that sweep the hottest EGT is 921 °C and the highest part stress 92% (turbine inlet). `src/sim/presets.test.ts` holds these points to the recorded tolerances.

**Known deviation: boost.** At the published 0.9 bar, the model makes about 350–370 Nm instead of 280 Nm, so the preset's boost target is calibrated to 0.6 bar. The model overestimates boosted torque at a given manifold pressure by about 20%. It probably has too little knock-limited spark retard, too little charge heating and too weak residual and back-pressure effects compared with the real K03 at high load. So boost changes on this preset are relative to the model's 0.6 bar, and absolute boost numbers should not be compared with a real car's logs.

**Pushing it.** On stock parts with knock control on, a boost push at 4,000 RPM reaches 328 Nm at a 1.0 bar target. The knock-control retard reaches its 12° limit at 1.3 bar, and the push ends with a cracked cast piston (sustained knock) at a 1.6 bar target. That is a model estimate, not a prediction of what a real AXX would take.

Not represented: intake manifold flaps, the dual (homogeneous split) injection used for catalyst heating, the twin catalysts' back pressure, the dual-mass flywheel, and the torque-based MED 9.1 strategy beyond its boost and λ maps.

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
| i-VTC (1.13.0) | Intake phaser, 50° range: −32° at 1,500 RPM, −15° at 2,500, 0° at 3,500, −25° at 4,500 around the changeover, +5° from 6,000 (all loads) | Range inferred; map calibrated to the curve |
| Rod length | 139 mm | Inferred (common figure; not confirmed by a source found) |
| Ignition | 12° BTDC at 1,500 RPM rising to 24° from 4,000 RPM at full load (map) | Calibrated: limits low-speed knock on RON 98 at 11.7:1 |
| Mixture | λ 0.92 at 4,000 RPM to 0.88 from 6,000 RPM at full load (map) | Inferred |
| Rev limit / mechanical limit | 8,600 / 9,000 RPM | Inferred from the 8,400 RPM redline |
| Fuel | RON 98 (Japanese premium is about RON 100, beyond this model's fuels) | Sourced, nearest available |

### Calibration and deviation

The curve was read from the image, so expect about ±5 Nm of reading error.

| RPM | 1,500 | 2,500 | 3,500 | 4,500 | 5,500 | 6,000 | 7,000 | 8,000 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Honda, Nm | ~160 | ~186 | ~204 | ~187 | ~208 | ~218 | ~210 | ~190 |
| Preset, Nm | 188 | 192 | 200 | 198 | 207 | 212 | 209 | 192 |

With model 1.13.0's intake phasing the preset makes 159, 181, 200, 191, 207, 215, 210 and 192 Nm at those speeds: within 5 Nm everywhere except −5 at 2,500 RPM, and RMS about 3 Nm. Retarding the intake removes 1.12.0's +28 Nm excess at 1,500 RPM and deepens the dip before VTEC. A standard sweep gives 162.3 kW at about 8,170 RPM and 215 Nm at about 6,280. The real i-VTC map is not published, so this phasing is a fit to the curve, not Honda's calibration.

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

At 3,500 RPM the preset makes 384 Nm against the rated 383 Nm. At 6,500 RPM it makes 305 Nm (208 kW) against 302 Nm (206 kW). Between those points the shape is the model's own: 379 Nm at 2,500 RPM and 347 at 5,500. A standard sweep gives 209.3 kW at about 6,490 RPM and 390 Nm at about 3,550. Unlike the Golf, this preset reaches its rated torque at roughly the real boost, so the model's boosted overestimate (see the Golf) is not consistent between engines. On stock parts, a boost push at 4,300 RPM cracks a cast piston at 1.4 bar above the map.

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

With VTC (1.13.0) the preset makes 274 Nm at 4,800 RPM against the rated 275 Nm, and 276 Nm (185 kW) at 6,400 RPM against 274 Nm (184 kW). It holds 274–281 Nm from 3,000 to 6,400 RPM, the broad plateau the S15 is known for. A standard sweep gives 189.6 kW at about 6,700 RPM and 281 Nm. On stock parts, a boost push at 4,500 RPM cracks a cast piston at 1.8 bar above the map.

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

At 5,200 RPM the preset makes 149 Nm against the rated 149 Nm. At 6,600 RPM it makes 130 Nm (90 kW) against 127 Nm (88 kW). A standard sweep gives 91.3 kW at about 6,380 RPM and 150 Nm at about 4,810. Not represented: T-VIS, the intake runner valve that improved low-speed torque.

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

## Two-strokes that wait

Requested by the user on 5 November 2026:

- **Yamaha YZ125 and YZ250, Aprilia RS125.** Bore, stroke and compression are published (YZ125: 54.0 × 54.5 mm, 8.2–10.7:1 depending on year), but manufacturers do not publish their power, and magazine dyno figures put them at roughly 9–13 bar brake mean effective pressure. The model's race single reaches about 5.3 bar because its trapping and pipe suction fall short (`docs/SIMULATION.md`, two-stroke calibration). They wait until that gap is fixed rather than shipping engines that make half their power. The 5 November investigation found no quick fix: with race-like hardware the model reaches about 15 Nm against the 20–22 Nm these engines make, so a preset now would make roughly 70% of its real torque.
- **Aprilia RS250 and Honda RS250R.** 90° V-twins, which need Stage 11's layouts.

