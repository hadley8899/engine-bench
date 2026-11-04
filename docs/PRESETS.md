# Real-engine presets

Each preset is an approximation of a real engine, calibrated to a published full-load torque curve. It uses this model's simplifications, so it is not a replica. Nor is it a prediction of what the real engine would survive: the part limits are model estimates (see `docs/SIMULATION.md`). Every value below is marked as **sourced**, **inferred** (a plausible choice with no published figure) or **calibrated** (chosen to match the published curve).

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

The RMS deviation is about 9 Nm. The largest deviations are +22 Nm at 1,000 RPM and −15 Nm at 1,500 RPM, where the model's turbo spools later and its naturally aspirated torque is higher than the real engine's. From 2,000 RPM up, every point is within 7 Nm. A standard 1,500–6,600 RPM sweep reaches 148.6 kW at about 6,070 RPM and 289 Nm at 3,650 RPM; in that sweep the hottest EGT is 921 °C and the highest part stress 92% (turbine inlet). `src/sim/presets.test.ts` holds these points to the recorded tolerances.

**Known deviation: boost.** At the published 0.9 bar, the model makes about 350–370 Nm instead of 280 Nm, so the preset's boost target is calibrated to 0.6 bar. The model overestimates boosted torque at a given manifold pressure by about 20%. It probably has too little knock-limited spark retard, too little charge heating and too weak residual and back-pressure effects compared with the real K03 at high load. So boost changes on this preset are relative to the model's 0.6 bar, and absolute boost numbers should not be compared with a real car's logs.

**Pushing it.** On stock parts with knock control on, a boost push at 4,000 RPM reaches 328 Nm at a 1.0 bar target. The knock-control retard reaches its 12° limit at 1.3 bar, and the push ends with a cracked cast piston (sustained knock) at a 1.6 bar target. That is a model estimate, not a prediction of what a real AXX would take.

Not represented: continuous intake cam phasing, intake manifold flaps, the dual (homogeneous split) injection used for catalyst heating, the twin catalysts' back pressure, the dual-mass flywheel, and the torque-based MED 9.1 strategy beyond its boost and λ maps.
