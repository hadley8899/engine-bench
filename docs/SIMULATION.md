# Engine model and browser-host decision

Model version: `eb-0d-1.10.0`. 1.10.0 adds equilibrium dissociation of the burned gas, which holds heat back while it is hot and returns it as it cools, so best power falls slightly rich of λ 1 (see Burned-gas chemistry). It applies to every build and lowers λ 1 full-load torque by about 2–3%. 1.9.0 makes rich burns form CO and H2 by water–gas shift equilibrium, so enrichment releases less heat into more gas and cools the charge. Port injection also cools the charge with the extra fuel's latent heat. It applies to every build: by the user's decision of 3 November 2026, no saved builds needed to keep 1.8.0 results. Results at λ ≥ 1 are unchanged apart from brief transient richness. 1.8.0 adds per-cylinder estimated temperatures (see Component temperatures); they observe the gas and change no result, so dyno results are bit-identical to 1.7.0. 1.7.0 adds optional engine-management maps and fuel-supply limits (see Engine management and fuel supply); builds without them give dyno results bit-identical to 1.6.0. 1.6.0 adds fuel grades, an end-gas knock estimate, optional ECU knock control and an optional predictive burn rate (see Combustion and knock). Builds saved before 1.6.0 read as fixed burn, RON 95 and no knock control, and their dyno results are bit-identical to 1.5.0. 1.5.0 makes the rev limiter's cut explicit (see Rev limiter) and adds exhaust systems, sound synthesis and optional road load, none of which change the physics of a run below the limiter: dyno results match 1.4.0. 1.4.0 adds fuel systems with wall-film fuel transport and misfire limits (see Fuel systems); steady full-load results for port injection, the default, match 1.3.0. 1.3.0 adds forced induction (see Forced induction); naturally aspirated results are unchanged from 1.2.0. 1.1.0 scaled friction with displacement and made starter torque configurable. 1.2.0 adds temperature-dependent gas properties, Woschni-form wall heat transfer, piston-speed friction and intake runner inertia, and recalibrates the presets (see Calibration). Runs recorded by earlier model versions remain readable as history. Written in TypeScript. Scope: four-stroke, fictional inline-four petrol engines, naturally aspirated or with the lumped forced-induction model. The Road and Sport definitions are experimental starting points, not calibrated replicas of production engines.

## Core equations and assumptions

Each cylinder has gas mass, internal energy, fresh charge, pressure and combustion state. Slider-crank geometry gives volume and its derivative with crank angle. Ideal-gas pressure acts on that derivative to produce indicated crank torque. Mechanical friction is a friction mean effective pressure of 60 kPa + 4.2 kPa·s/m × mean piston speed + 0.43 kPa·s²/m² × mean piston speed², converted to torque through displacement. This is a generic fit in the range commonly quoted for passenger-car petrol engines (about 85 kPa at 1,500 RPM and 260 kPa at 6,000 RPM for 86 mm stroke). Pumping work is not included in it because gas exchange is simulated. Very small or very large engines are rough estimates. Power is derived from brake torque and angular speed. No horsepower curve or audio recording is supplied as an input.

Each cylinder has a lumped intake runner whose gas momentum is driven by the manifold-to-cylinder pressure difference and resisted by the intake valve's quadratic (incompressible orifice) loss: `L/A · dṁ/dt = Δp − ṁ|ṁ|/(2ρA_v²)`. It is solved implicitly each substep so a nearly closed valve stays stable, and capped at the valve's choked flow. Runner area is 0.15 × piston area (about 0.39 × bore diameter), or 1.2 × the peak valve area if larger; runner length is a build setting. Momentum is discarded when the valve closes; pressure waves and reflections are not solved, so this captures inertial ram filling but not wave tuning. The exhaust valve remains a quasi-steady compressible isentropic orifice with sonic choking and reverse flow. Flow transports enthalpy; energy changes through combustion, pressure-volume work and wall heat transfer.

In-cylinder gas uses a specific heat at constant volume rising linearly with temperature (cv = 660 + 0.17·T J/kg·K, so γ ≈ 1.40 at 300 K and ≈ 1.26 at 2,500 K), a single-zone approximation of air and burned-gas properties. Dissociation and rich-burn products are added to it per cylinder (see Burned-gas chemistry). Valve-flow equations keep cold-air γ = 1.4. Wall heat transfer uses the Woschni correlation form (h = 3.26·B^-0.2·p^0.8·T^-0.55·w^0.8, with p in kPa) with gas velocity 2.28 × mean piston speed + 1 m/s and no separate combustion term; a calibration factor of 3 stands in for that term. Wall area is the head, the crown and the exposed liner. Walls are assumed to be 80 K above the coolant state. Combustion uses a Wiebe fraction with exponent 3 and coefficient 6.9. Effective valve areas include the discharge coefficient. Apart from rich-burn products, specific heats and gas constant are held fixed. Wave propagation, exhaust pipes, acoustic radiation and detailed chemical kinetics are not solved.

Air humidity is relative humidity; oxygen is dry-gas mole/volume fraction. Water vapour displaces dry air. Dry gas is approximated as oxygen/nitrogen; the bulk gas constant and specific heats remain air approximations over the supported range. Fuel arrives with the fresh charge as set by the fuel system (see Fuel systems), and leaves with any charge pushed back out of the cylinder. Heat release is limited by both the delivered fuel and oxygen, with the fuel grade's heating value (43 MJ/kg for petrol). Extra oxygen cannot burn fuel that is not present, and a rich charge releases less than a stoichiometric one (see Burned-gas chemistry). A charge whose delivered λ is above 1.6 or below 0.55 does not ignite (a misfire). Fuel enrichment is not automatically recalibrated for every environment.

A simple lumped coolant state evolves separately from ambient temperature. This is illustrative thermal behaviour, not a prediction of overheating or component life. Knock is estimated (see Combustion and knock) but causes no damage yet. Emissions, oil pressure, valve float, wear and failures are not implemented. The mechanical limit is a configurable assumed capability used for warnings and dyno validation/abort; it is not a component stress calculation.

Schema ranges bound the operating envelope and are deliberately wide so that unusual builds are possible: bore and stroke 20–300 mm, rod length at least 0.75 × stroke (rod to crank-radius ratio 1.5), compression 5–20:1, effective valve areas 10–20,000/25,000 mm², intake runner length 50–1,500 mm (300 mm for builds saved before 1.2.0), inertia 0.01–20 kg·m², limiter up to 20,000 RPM and mechanical limit up to 25,000 RPM. These ranges are what the core has been stress-tested across (every combination of the extremes at 600 and 19,900 RPM, plus free starts at idle and full throttle), not a statement that such engines are buildable or that the model is accurate there. Valve timing, ignition, burn duration and mixture keep their original ranges. The model rejects invalid temperatures (below 30 K or above 6,000 K)/mass and limits a single outflow integration increment to 8% of cylinder mass. These are numerical safeguards, not physical failure models. Errors stop the run and are exposed instead of replacing data with a synthetic curve.

## Calibration

The 1.2.0 constants (Woschni factor, wall temperature, friction coefficients) and the preset valve areas, intake closing, runner length and ignition timing were tuned so the generic presets fall inside plausibility bands for a naturally aspirated 2.0 L petrol engine: peak BMEP about 1.0–1.3 MPa in the mid-range, full-load torque rising out of low speed, peak power above 5,500 RPM, and peak cylinder pressure below about 100 bar. These bands are general textbook ranges, not a sourced reference curve. Steady full-throttle holds at standard conditions give:

| Preset | Peak torque | Peak power | Torque at 1,500 RPM | Peak cylinder pressure |
| --- | --- | --- | --- | --- |
| Road (86 × 86 mm, 300 mm runner) | 193 Nm at 4,500 RPM (BMEP 1.22 MPa) | 110 kW at 6,000 RPM | 176 Nm | 86 bar |
| Sport (240 mm runner, later intake closing) | 186 Nm at 5,500–6,000 RPM | 131 kW at 7,000 RPM | 165 Nm | 100 bar |

These are the fixed-burn figures. With 1.6.0's predictive burn and knock control (how the presets now ship) the Road preset gives 192 Nm at 4,500 RPM, 108 kW at 6,000 RPM, 175 Nm at 1,500 RPM and 81 bar; the Sport preset 185 Nm at 5,500 RPM, 134 kW at 7,500 RPM, 164 Nm at 1,500 RPM and 88 bar.

Before 1.2.0 the Road preset made 281 Nm at 1,500 RPM (BMEP 1.77 MPa, about 55% brake efficiency) and fell steadily with speed because its valve areas choked flow from about 2,500 RPM. Neither preset replicates a production engine. Validation against a sourced reference torque curve is Stage 7 work. Ignition timing is a single value. With the fixed burn rate, burn duration does not change with speed; with the predictive burn rate (1.6.0) it does, so the best timing (MBT) moves with speed and load. From 1.7.0 timing can come from a map instead (see Engine management and fuel supply).

## Forced induction

A build's `induction` is `none` (the default, and how builds saved before 1.3.0 read), `turbo`, `centrifugal` or `roots`. All three share one lumped charge-air path: compressor → charge pipe and intercooler volume (2 × displacement, at least 0.5 L) → throttle → manifold. The throttle's manifold-pressure target is applied to the pressure after the intercooler instead of to ambient, and the cylinders draw air at the charge-air temperature. The charge volume's pressure follows mass conservation between compressor delivery, the cylinders' intake flow (smoothed over 4 ms) and any vented air. Boost values are gauge pressure. Each part is advanced once per 48 kHz step from the cylinders' flows over that step.

- **Centrifugal compressors** (turbo and centrifugal supercharger) use a parametric map rather than a measured one. Work per kilogram is a slip factor of 0.9 × tip speed². Each speed line is an ellipse from a shut-off pressure ratio `(1 + η·0.9·U²/(cp·T))^3.5` at zero flow to choke flow `0.14 · ρ · U · D²`. Efficiency peaks at 65% of choke flow and falls quadratically away from it. Operating above 1.15 pressure ratio at under 20% of choke flow is flagged as surge. A slow or stopped wheel still passes air to the engine through half its inlet area.
- **Turbo**: a separate exhaust manifold volume (1 × displacement, at least 0.3 L) receives the cylinders' exhaust mass and enthalpy and supplies their backflow. It loses heat to its surroundings and empties through the turbine (a choked-capable nozzle of the build's area) and the wastegate. Turbine power is `ṁ · cp · T · η · (1 − (p_a/p)^0.248)`, with efficiency peaking at a blade-speed ratio of 0.7. Shaft speed integrates turbine power minus compressor power minus bearing drag over the rotor inertia, so lag and spool come from the physics. The wastegate port is sized from the engine (half the total exhaust valve area, or the turbine area if larger). It opens progressively from the boost target, with an 80 ms actuator lag. Exhaust sound is taken from the flow leaving the turbine and wastegate, so a turbo muffles the pulses. If the manifold exceeds 30 × ambient pressure or 2,500 K, the run stops with a "turbine too small" error rather than hiding the state.
- **Centrifugal supercharger**: the compressor is geared to the crank at the drive ratio, so boost rises with RPM. Compressor power divided by a 95% drive efficiency is taken from crank torque.
- **Roots supercharger**: a positive-displacement blower moves its displacement per revolution at inlet density, minus leakage back past the rotors (an orifice of `0.012 · displacement^(2/3)`). With no internal compression, it pushes its volume against outlet pressure at the stated efficiency; that power is taken from the crank and heats the charge. Boost arrives early and stays nearly flat.
- **Intercooler**: removes a fraction (its effectiveness) of the compressor's temperature rise towards ambient, with a pressure loss proportional to flow². The charge-air temperature follows that target with a 0.6 s thermal lag.
- **Blow-off / bypass valve**: vents the charge pipe when manifold pressure falls below 60% of supply (throttle lift-off). From 1.5.0 a blow-off valve has an effective area of 2.8% of total piston area (about 650 mm², a 29 mm hole, on a 2.0 L engine), so lift-off from 0.8 bar vents for about a second. Before 1.5.0 it shared the roots bypass's size (15% of piston area, about 3,500 mm²) and emptied the charge in under 0.1 s, far faster than a real valve. Full-throttle results are unchanged. Without one, a turbo or centrifugal compressor surges on lift-off, which is flagged and heard. The roots bypass lets the blower idle unloaded.
- **Sound**: see Sound and view.
- **Not modelled**: knock, boost-dependent timing, compressor maps from real hardware, pressure waves in pipes, turbo bearing or wheel failure (the maximum shaft speed only raises a warning), and fuel enrichment under boost. The Road and Sport presets remain naturally aspirated.

Default turbo on the Road engine at 9:1 compression (steady full throttle) gives about 0.1 bar at 1,500 RPM, then full 0.8 bar boost from about 3,500–4,000 RPM. Torque peaks at about 340 Nm, power at about 200 kW near 6,500 RPM, and peak cylinder pressure is about 125–130 bar. Real engines at this boost need lower timing to avoid knock, so these figures are optimistic.

## Fuel systems

A build's `fuelSystem` is `carburettor`, `throttleBody`, `port` (the default, and how builds saved before 1.4.0 read) or `direct`. The engine's λ is the commanded mixture. Fuel reaches each cylinder in proportion to the fresh air it draws, through a lumped x–τ wall-film model after Aquino (SAE 810494):

- A share X of the metered fuel deposits on the intake walls. The film evaporates with time constant τ into the manifold vapour. That vapour is drawn into the cylinders in proportion to the manifold's air (displacement volume at manifold pressure and temperature). At steady state the delivered mixture equals the metered one. When airflow rises, the film takes fuel and the mixture leans (tip-in). When airflow falls, the film releases it and the mixture runs rich (lift-off).
- τ is quoted at warm idle airflow (2 kg/s per m³ of displacement) and falls with the square root of airflow, since faster air strips the film. Coolant below 80 °C lengthens τ by `1 + ΔT/40` and raises X by `1 + ΔT/150` (X at most 0.85). The intake walls start primed at their warm-idle film, as for an engine that has just been running.

| System | X | τ at idle | Metering | Evaporative cooling |
| --- | --- | --- | --- | --- |
| Carburettor | 0.3 + 0.35·exp(−v/40 m/s), from venturi velocity v | 0.35 s | Venturi: by volume | 25% of latent heat taken from the charge air |
| Throttle-body injection | 0.4 | 0.3 s | ECU: by air mass | 25%, from the charge air |
| Port injection | 0.25 | 0.12 s | ECU: by air mass | 50% of the latent heat beyond stoichiometric petrol's, which is inside the 1.2.0 calibration |
| Direct injection | 0 | — | ECU: by air mass | 60%, from the cylinder charge during intake |

- **Carburettor**: fuel flow through a fixed jet follows √(Δp·ρ_fuel) and air flow √(Δp·ρ_air), so the delivered fuel–air ratio scales with 1/√ρ_air. Jetting is set by λ at standard dry air (20 °C, 1,013.25 hPa): thin or hot air runs rich, cold dense air lean. The venturi, booster and throttle plate lose 0.6 throat dynamic heads (`0.6·ṁ²/(2ρA²)`, capped at 50 kPa) ahead of the throttle. With forced induction the carburettor is draw-through: the loss lowers the compressor inlet pressure, and metering uses ambient density. The accelerator pump squirts 0.185 kg per m³ of displacement over a full throttle opening, released with a 0.15 s time constant into the airstream, where it wets the walls like the jet fuel. There is no overrun fuel cut. Not modelled: idle and progression circuits, weak main-jet signal at low airflow, enrichment (power) valves, float-bowl dynamics and chokes.
- **Electronic injection** (throttle body, port, direct): fuel follows measured air mass, so λ holds across conditions. Transient correction inverts the film model and recovers 85% of the ideal correction. Overrun cut stops fuel when the driver's throttle is closed above 1,800 RPM and resumes below 1,400 RPM or on throttle. Turning transient correction off approximates early analogue or mechanical injection.
- **Direct injection**: no intake film. Evaporation in the cylinder during intake lowers the charge temperature, so the cylinder draws a little more air. The high-pressure pump takes `fuel volume flow × 15 MPa / 0.5` from the crank. Higher knock tolerance, stratified charge and injection timing are not modelled.
- **Latent heat** of gasoline is taken as 350 kJ/kg. The fuel's own mass is not added to the cylinder gas.

Full-load torque on the Road engine at 1,500 / 3,000 / 4,500 / 6,000 RPM:

| Fuel system | Nm |
| --- | --- |
| Port injection (1.3.0 equivalent) | 176 / 185 / 193 / 175 |
| Throttle-body injection | 179 / 189 / 198 / 178 |
| Carburettor, 2 × 32 mm | 179 / 188 / 196 / 175 |
| Carburettor, 1 × 24 mm | 177 / 180 / 175 / 145 |
| Direct injection | 184 / 195 / 204 / 179 |

The 25% charge-cooling share for manifold-fed systems is an assumption; real manifolds are often heated, which reduces it. Fuel-system results are trends for comparison, not measured equivalences.

## Combustion and knock

A build's `combustion` block holds the fuel grade, the burn-rate model and ECU knock control. Builds saved before 1.6.0 read as `fixed`, `ron95` and no knock control, and reproduce 1.5.0 exactly (checked against the committed 1.5.0 core: all five starting builds give bit-identical dyno sweeps). The starting builds use the predictive burn with knock control on.

**Fuel grades.**

| Fuel | Octane (RON) | Stoichiometric AFR | Heating value | Latent heat |
| --- | --- | --- | --- | --- |
| RON 91, 95, 98 petrol | 91 / 95 / 98 | 14.7 | 43 MJ/kg | 350 kJ/kg |
| E85 | 105 | 9.8 | 29.2 MJ/kg | 850 kJ/kg |

The ECU meters to the fuel's own stoichiometric ratio, so λ means the same for every fuel and E85 needs about 50% more fuel by mass. Oxygen needed per kilogram of fuel scales with the stoichiometric ratio. E85's extra evaporative cooling comes from its latent heat through the fuel-system cooling shares (port injection, whose stoichiometric petrol cooling is inside the calibration, gets half of any latent heat beyond it, from E85 or from enrichment). Its octane figure is a commonly quoted value; much of E85's knock resistance in practice comes from that cooling, which is modelled separately.

**Burn rate.** With `fixed`, every burn takes `burnDuration`. With `predictive`, `burnDuration` is the figure at 3,000 RPM and full load, and each burn is scaled by the ratio of a reference turbulent flame speed to the one at spark:

- Laminar flame speed follows Metghalchi and Keck: `S_L = S_L0(φ)·(T_u/298)^2.18·(p/1 atm)^-0.16·(1 − 2.06·x_r^0.77)`, with their petrol fit `S_L0 = 0.305 − 0.549·(φ − 1.21)²` m/s (E85: 0.36 − 1.0·(φ − 1.11)², an approximation between petrol and alcohol fits). T_u and p are the cylinder state at spark and x_r the residual (non-fresh) mass fraction.
- Turbulent flame speed is `S_T = S_L·(1 + 2.5·(Ū_p/S_L)^0.7)`, taking turbulence intensity as proportional to mean piston speed Ū_p. The constant sets how much the laminar part matters; the reference is S_T for petrol at φ = 1, 700 K, 15 bar, x_r = 0.08 and this engine's piston speed at 3,000 RPM.
- Duration in crank degrees is `burnDuration × (RPM/3,000) × S_T,ref/S_T`, clamped to 0.7 × `burnDuration`–120°. The floor only binds for laminar-dominated engines far smaller than a car's at idle.

The Road engine burns in about 36° at 1,200 RPM, 49° at 3,000 RPM and 59° at 6,000 RPM at full load, and 69° at 3,000 RPM with 18 kPa in the manifold. MBT timing at full load moves from about 8° at 1,200 RPM to 20–24° at 6,000 RPM.

To give part load a realistic residual, the predictive burn also tracks what each intake runner holds: gas pushed back into the runner (burned gas during overlap, mixed charge after bottom dead centre) returns first, with the composition it left with, up to the runner's volume or half the swept volume; anything beyond mixes into the plenum and returns as fresh charge. Mass and energy accounting are unchanged (returned gas re-enters at the intake enthalpy). On the Road engine the residual fraction at spark is 5% at full load, 11% at 43 kPa and 28% at 18 kPa; 1.5.0 re-inducted all of it as fresh air (6.5% at 18 kPa). A diluted idle needs more air, so the predictive burn also gives the idle-air control an integral trim (0.0003 throttle per RPM-second, at most 0.3, with the idle throttle capped at 0.6 instead of 0.38). Every starting build idles at 940–970 RPM.

**Knock.** End-gas autoignition uses the Livengood–Wu integral `∫ dt/τ` from intake closing until 98% of the charge has burned, with a Douaud–Eyzat ignition delay:

`τ = 3.3 × 17.68 ms × (RON/100)^3.402 × (p/1 atm)^-1.7 × exp(3,800/T_u) × exp(2·(1 − λ)) × (1 + 1.5·x_r)`

- T_u, the unburned end-gas temperature, follows isentropic compression from the cylinder state at intake closing: `T_u = T_IVC·(p/p_IVC)^0.248`.
- The mixture factor lengthens the delay for rich mixtures and shortens it for lean ones; the residual factor lengthens it for inert dilution. Residual heating is already in T_IVC. Both factors are model assumptions, not part of the published correlation.
- The 3.3 factor calibrates the correlation to this model's single-zone, lumped end gas. It was chosen so the Road engine (10.2:1, 20°, RON 95) runs clean at full load from about 2,000 RPM and knocks when lugged below that, as fixed-timing engines of that compression commonly do.
- Knock is reported per cylinder, per cycle. The **knock index** is the integral when the window closes; 1 or more means the end gas autoignited before the flame reached it. The **intensity** is the unburned share of the charge at onset (1 if it happened before the spark). An unlit charge reports nothing.

Knock does not change the cycle's heat release, pressure or torque in this version, and causes no damage yet; failures are planned Stage 6 work. Its costs today are what the ECU does about it.

**Knock control.** When a cylinder's intensity exceeds 3%, the ECU retards that cylinder's timing 2° (up to 12°). Timing recovers at 1.5° per second. Off, the engine runs unprotected and the bench only reports knock. Dyno samples recorded by 1.6.0 carry the highest knock index and the mean retard over each sample, and the pull summary says where a run knocked.

| Turbo hot hatch, 1,500–6,200 RPM sweep | Peak power | Knock |
| --- | --- | --- |
| RON 98 (its fuel) | 216 kW | None (closest 93% of onset at 4,300 RPM) |
| RON 95 | 216 kW | 3,970–5,020 RPM, below the sensor threshold |
| RON 91, knock control on | 215 kW | 3,860–4,910 RPM; up to 3.7° retard |
| RON 91, knock control off | 216 kW | 3,860–6,070 RPM |

**Sound.** A knocking cycle rings the cylinder's first circumferential gas mode, `f = 1.84·c/(π·B)` with c ≈ 950 m/s (about 6.5 kHz for an 86 mm bore), with its second mode at 1.66× and a 3 ms decay. It is heard through the block, so loudest from the engine bay.

These are estimates for comparing builds and seeing trends, not knock-limited spark advance predictions for a real engine.

## Burned-gas chemistry

The burned gas is an equilibrium mixture of CO2, CO, H2O, H2, OH, H, O2, O and N2 above 1,740 K. Below that its composition freezes, as Heywood (*Internal Combustion Engine Fundamentals*, §4.9) takes for rich burned gas. Each burn's mixture (φ = 1/λ) and the cylinder's temperature and pressure set the composition:

- **Equilibrium constants** for CO2 ⇌ CO + ½O2, H2O ⇌ H2 + ½O2, H2O ⇌ ½H2 + OH, ½H2 ⇌ H and ½O2 ⇌ O are `log10 Kp = A − B/T` (p in bar), fitted to the NIST-JANAF log Kf of CO2, CO, H2O (C-095, C-093, H-064), OH (H-038), H (H-001) and O (O-001) at 2,000 and 3,000 K. They reproduce the tables within 0.03 from 1,500 to 3,500 K, and the implied water–gas shift constant is 3.5 at 1,740 K, matching Heywood's value. Nitrogen does not dissociate, and NO is not formed.
- **Fuels** are CH1.87 petrol and an E85 of 83% ethanol by mass (CH2.71O0.373).
- **Held heat:** the burn releases its fuel's heating value (× 0.96, as before) into the cylinder's energy. The share that the dissociated species and frozen CO and H2 still hold, from 298 K formation enthalpies, is subtracted to find the temperature. Hot gas therefore holds heat back and returns it as it cools in expansion. The temperature is solved by Newton's method each substep while the gas is above 1,740 K.
- **Moles:** dissociation and a rich burn's surplus fuel add molecules, which scale the cylinder's gas constant.
- **Heat capacity:** a rich burn's frozen CO and H2 add heat capacity, from molar cv near 1,800 K (JANAF): CO2 52.8, CO 27.8, H2O 42.6, H2 25.2 and N2 27.4 J/(mol·K). Dissociation's own effect on apparent heat capacity comes from the held heat.

Tables of held heat and moles by temperature (1,740–3,740 K in 40 K steps) and pressure (0.5–400 bar, log-spaced) are built for 51 mixtures (φ 0.6–1.85) per fuel when a fuel is first used, which takes about 120 ms. Each cylinder interpolates its burn's mixture from them.

| Held share of the burnable fuel's heat, 60 bar | 1,740 K | 2,200 K | 2,600 K | 3,000 K |
| --- | --- | --- | --- | --- |
| λ 1.15 | 0.0% | 0.5% | 3.7% | 14.5% |
| λ 1.00 | 0.1% | 1.2% | 5.7% | 17.1% |
| λ 0.90 | 3.8% | 4.0% | 5.2% | 13.3% |
| λ 0.85 | 6.1% | 6.4% | 7.2% | 13.0% |

At λ 0.85, a rich burn's frozen heat is 0.94 of a stoichiometric burn's per unit of air: 0.80 of the heating value of the fuel supplied, which matches the combustion efficiency of rich mixtures in Heywood. Its moles rise 4.6% and its heat capacity 1.8%. Products leave with the exhaust and the intake backflow, and dilute as fresh charge arrives. Frozen CO and H2 leave as chemical energy: neither the exhaust temperature nor a turbocharger receives it. Gas returning from either manifold, including pushed-back runner gas, re-enters with air properties. Factors are on an air-mass basis, so the fuel's own mass is still not added to the gas. Valve flow uses the scaled gas constant through `√(R·T)` but keeps cold-air γ. The unburned charge, including excess fuel vapour, keeps air properties during compression, so the knock correlation's mixture factor is unchanged. The model is single-zone: dissociation is evaluated at the mean gas temperature, which is below the burned gas's own during combustion.

Full-load peak in-cylinder temperature on the Road engine fell from 2,900–3,070 K in 1.9.0 to 2,720–2,840 K. Results on the Road engine, full-load holds of 16 s:

| λ | 4,500 RPM torque | EGT | Crown | Valve | Knock index |
| --- | --- | --- | --- | --- | --- |
| 1.10 | 173 Nm | 815 °C | 224 °C | 503 °C | 0.61 |
| 1.00 | 188 Nm | 891 °C | 236 °C | 547 °C | 0.57 |
| 0.95 | 189 Nm | 847 °C | 236 °C | 523 °C | 0.53 |
| 0.90 | 188 Nm | 808 °C | 234 °C | 502 °C | 0.48 |
| 0.85 | 186 Nm | 771 °C | 232 °C | 482 °C | 0.43 |
| 0.80 | 184 Nm | 733 °C | 228 °C | 461 °C | 0.39 |

1.9.0 gave 192 Nm and 867 °C at λ 1, with torque falling steadily as the mixture richened. Now best power is at about λ 0.95, 0.6% above λ 1. Torque stays within 1.5% of it from λ 0.85 to 1.0, so enrichment to λ 0.9 costs nothing and lowers EGT by 83 K. At 2,000 RPM the curve is the same shape (175 Nm at λ 1 and 0.95). λ 1's EGT rose about 20 K, because the dissociated heat returns late in expansion.

**Remaining gaps.** Real engines usually reach best power nearer λ 0.86–0.9 and a few per cent above λ 1. Charge cooling from in-cylinder evaporation, mixture inhomogeneity and the single-zone temperature are likely reasons for the difference. The EGT drop from λ 1.0 to 0.85 (120 K) is also larger than the rough 30–60 K that `PLAN.md` first quoted, which no calibrated full-load data has confirmed. These are model estimates for comparing mixtures, not a calibration tool.

## Engine management and fuel supply

A build's `management` is null (the single ignition advance, λ and boost target apply everywhere; how builds saved before 1.7.0 read) or a set of maps:

- **Ignition** (degrees before top dead centre, −10 to 50) and **target λ** (0.7–1.3), each by RPM and load, where load is absolute manifold pressure. Knock retard is taken off the mapped timing. With maps, the spark may be after top dead centre (to −10°); without maps it stays at 1° or more, as in 1.6.0.
- **Boost target** (gauge, 0–4 bar) by RPM and driver throttle. Boost itself sets manifold pressure, so it cannot also be indexed by it. It replaces the turbo's single wastegate target; superchargers have no target to map.
- Breakpoints must increase (2–16 per axis). Values between them are interpolated bilinearly and held flat beyond the ends. Every table must match its axes.
- The ECU reads the tables every 16 steps (3 kHz) and on a new core's first step.
- Switching maps on starts from flat tables at the build's single values on axes suited to it (800 RPM to the limiter in 500 RPM steps, 20–100 kPa, up to 250 kPa when boosted), so nothing changes until a cell is edited. A test checks that flat maps reproduce the single values exactly.
- A carburettor cannot follow the λ map; its jets set the mixture. Ignition and boost maps still apply.

A build's `fuelSupply` is null (unlimited, as before 1.7.0) or four injectors' flow each (cc/min with the fuel in use), their duty limit and the fuel pump's flow (L/h; for direct injection, the high-pressure pump). The most fuel that can be delivered is the lesser of `4 × injector flow × duty limit` and the pump flow, at the fuel's density (740 kg/m³ petrol, 781 kg/m³ E85). When the commanded fuel exceeds it, injection is capped at that flow. The mixture goes lean, which also raises knock, and the bench shows FUEL LIMITED for 0.3 s after the last capped step. A carburettor has no injectors and is limited only by its pump. Injector flow does not change with manifold or rail pressure, and there is no injector dead time or minimum pulse width.

The starting builds carry fuel supplies with modest headroom. Peak injector duty at full load is 60–71%; the hot hatch's direct injectors (450 cc/min) reach 71% and its high-pressure pump 59% at 6,000 RPM. Turning the boost up, or switching to E85, runs out of fuel soon after.

## Component temperatures

Each cylinder has four lumped temperatures, all estimates. They read the simulated gas and never change it: the gas still loses heat to walls held 80 K above the coolant, as in 1.2.0, and every result is bit-identical with or without them (checked against 1.7.0 for all five starting builds, with and without maps). They update every 48 steps (1 kHz).

- **Exhaust port gas (EGT):** the mass-flow-weighted temperature of gas leaving the cylinder over each exhaust event, smoothed with a 0.25 s time constant (thermocouple-like). This is hotter than a time-averaged thermocouple reading.
- **Piston crown:** receives the wall heat flow on its area (the piston area's share of the head, crown and exposed liner surface the gas sees), and loses heat to oil and liner, held 10 K above the coolant. Conductance is 5,500 W/K per m² of piston area and the time constant 4 s. Knock multiplies the crown's heat input by `1 + 4 × intensity`; knock's scouring of the thermal boundary layer is well documented, but this factor is an assumption. Because temperatures are observers, that extra heat is not taken from the gas.
- **Combustion deck (head):** the same heat share, against the coolant: 8,200 W/K per m² and 15 s.
- **Exhaust valve:** settles towards a mix of EGT and the deck temperature, weighted `1.9 × (exhaust flow / reference)^0.8 : 1`, where the reference is one cylinder's flow of a full standard charge at 6,000 RPM. More flow past the valve heats it more. Its time constant is 2 s divided by `(1 + that weight)`.

Conductances were chosen so the Road engine at full load and 6,000 RPM settles at about 926 °C EGT, 292 °C crown, 634 °C valve and 202 °C deck with the coolant near 93 °C. These are typical published ranges for production petrol engines, not measurements of this engine. The Turbo hot hatch at 5,000 RPM and full boost settles at about 1,010 °C EGT, 324–348 °C crown and 735–760 °C valve. Real turbocharged engines usually cool their pistons with oil jets, which are not modelled yet.

Trends follow the cycle model:
- Load raises every temperature.
- Retarded timing moves heat from the crown into the exhaust.
- Knock heats the crown.
- Enrichment cools: from λ 1.0 to 0.85 at 4,500 RPM, EGT falls 120 K, the valve 65 K and the crown 4 K (see Burned-gas chemistry).

Identical cylinders read the same: differences come only from modelled causes, such as manifold interactions, per-cylinder knock retard and knock heat. Dyno samples recorded by 1.8.0 carry the hottest cylinder's EGT.

The bench colours a temperature amber or red at 980/1,050 °C EGT, 320/350 °C crown and 800/870 °C valve. These are display guides, not failure limits; the part limits are in the next section. The cutaway's pistons glow from about 250 °C, and a knocking chamber flashes white.

## Parts, stress and failures

Model 1.11.0 (`src/sim/parts.ts`). Every limit below is an estimate calibrated against this model's own pressures and temperatures, so that the five starting builds run at full load with margin and plausible abuse breaks something. None is a rating for a real part, and real component strengths are rarely published, so none should be read as "how much a real engine would take". Forum figures were not used as specifications.

**Parts.** A build carries `parts`: pistons (cast, hypereutectic, forged), connecting rods (stock, forged I-beam, H-beam), head gasket (composite, multi-layer steel, O-ringed copper), head fasteners (bolts, studs) and valve springs (stock, uprated, race). Builds saved before 1.11.0 read with stock parts (cast, stock, MLS, bolts, stock).

What parts change, beyond their limits:

- **Mass and inertia.** A piston assembly (piston, pin, rings) weighs `740 kg/m³ × bore³` (0.47 kg at 86 mm), scaled 0.95 hypereutectic and 1.06 forged. A rod weighs `567 kg/m³ × bore² × rod length` (0.6 kg for the Road engine), scaled 0.95 forged I-beam and 1.1 H-beam. A third of the rod reciprocates with the piston. Parts heavier or lighter than stock change the crank inertia by their rotating mass and half their reciprocating mass, times crank radius². Stock parts add nothing, so the build's own inertia figure still applies.
- **Friction.** Uprated and race springs add 2.5 and 6 kPa of friction mean effective pressure (about 0.4 and 1 Nm on 2 L).
- Pistons do not change the crown's thermal properties in this version.

Turbochargers, intercoolers, injectors and fuel pumps are offered as named sets of the existing induction and fuel-supply fields (small to big turbos, intercoolers from none to water-to-air, 240–1,000 cc/min injectors, 110–450 L/h pumps). Fitting one writes those values; they have no further hidden effect.

**Loads.** The core records, per cylinder and cycle (intake closing to intake closing):

- peak cylinder pressure;
- rod compression and tension along the bore: gas force `(p − p_ambient) × piston area` less the reciprocating mass's inertia, `m × r × ω² × (cos θ + (r/l) × cos 2θ)`. Gas force peaks just after firing TDC; inertia tension peaks at TDC on the exhaust stroke.

Temperatures and knock come from the existing models. Loads are compared with the limits every millisecond.

| Limit | Basis | Stock | Upgrades |
| --- | --- | --- | --- |
| Rod compression (buckling) | Peak compressive rod force | 140 bar on the piston area | Forged I 190, H-beam 230 bar |
| Rod tension | Peak inertia tension | 1.25 × tension at the build's mechanical limit with stock parts | Forged I ×1.4, H-beam ×1.65 |
| Piston crown | Crown temperature | Cast 437 °C | Hypereutectic 452 °C, forged 497 °C |
| Piston knock | Unburned share at knock onset | Cast 6% | Hypereutectic 4.5% (brittle), forged 13% |
| Head gasket | Peak pressure × (1 + 1.5 × knock intensity) | MLS with bolts 150 bar | Composite 125, copper 180 bar; studs ×1.2 |
| Valve float | Crank speed | 1.08 × mechanical limit | Uprated 1.2×, race 1.33× |
| Turbo speed | Compressor shaft speed (turbo or centrifugal) | 1.12 × the turbo's rated maximum (burst, not rated speed) | Set by the turbo |
| Turbine inlet | Turbo exhaust manifold temperature | 1,100 °C | None |

Stock rods and valve springs are rated against the build's estimated mechanical limit, so raising that field describes a stronger design. The electronic rev limiter remains separate and never strengthens anything.

The crown limits sit higher than real aluminium pistons usually tolerate (around 350 °C), because this model's crowns run hot: the Turbo hot hatch reaches about 376 °C at 6,200 RPM without oil jets. The limits are relative to the model, which is why they are labelled estimates.

**Exposure and failure.** A part fails when its limit stays exceeded: exposure grows at `(ratio − 1)/0.1 × dt/hold`, so 10% over fails in `hold` seconds and 30% over three times faster. Below the limit exposure falls by 1/20 per second, so brief excursions survive. Hold times are 0.4 s for rods, 1 s valve float, 1.5 s head gasket, 2 s crown and turbo speed, 3 s knock and 5 s turbine temperature. There is no wear: a rebuild starts every part fresh.

A failure (a holed or cracked piston, bent or broken rod, lifted head gasket, valve-to-piston contact, burst compressor wheel or cracked turbine housing) stops combustion, injection and the starter. The engine coasts to a stop, and the stress readings freeze as they were at the moment of failure. The bench shows what failed, where and why. Rebuild, or Start, makes a fresh core from the last build. A dyno run that meets a failure is aborted with the failure as its reason, and samples record the highest stress share. Failures are deterministic for the same snapshot, controls and host. Indestructible mode still reports stress and exposure but never fails a part; dyno runs record it as a warning.

Not modelled: valve float losing power or bending valves before contact, partial damage (a running engine with a damaged part), wear and fatigue accumulation, oil jets, piston ring flutter, bearing loads, crank torsion, and head-lift leakage before failure.

## Camshafts and valve timing

Model 1.13.0 (`src/sim/cams.ts`). Builds without `cams` keep fixed events: intake from 350° to the intake closing angle, exhaust from 145° to 370° (0° is firing top dead centre, 360° overlap top dead centre). Their flow area follows half a sine wave to the full intake or exhaust area at mid-event, exactly as before.

**Profiles.** `cams` gives each cam an opening angle, a closing angle and a peak lift. Lift follows half a sine wave between them. Flow area is the build's intake or exhaust area times `min(1, lift / (0.25 × d))`, where d is the head diameter of one of two valves that would give that area with a discharge coefficient of 0.6. Flow is curtain-limited at low lift and port-limited once lift passes a quarter of the diameter, so extra lift fills out the event rather than raising its peak. `camsFromEvents` converts fixed events into profiles that reproduce them bit for bit (the editor's "Edit cam profiles"). The editor shows events as cam cards quote them (degrees before or after the dead centres), plus duration, centrelines, lobe separation and overlap. Mild, fast-road and race grades set durations of 230/225°, 260/255° and 290/285° and lift of 0.27, 0.32 and 0.37 × the valve diameter, keeping each cam's centreline.

What follows from the valve flows, with no extra rules:
- Longer duration and later intake closing move torque up the rev range and cost low-speed torque. On the Road engine, the race grade loses 28 Nm at 2,000 RPM and gains 23 at 6,500.
- Overlap pushes exhaust back into the intake at low speed. With the predictive burn's runner residual, that makes idle rougher: the idle-speed spread grows from 23 to about 65 RPM. The sound follows, because it comes from the same pulses.
- On a boosted engine, overlap passes intake charge through to the exhaust when manifold pressure exceeds back pressure.
- Not represented: tuned exhaust pulses scavenging the cylinder (the exhaust sees a lumped back pressure), valve ramps and real cam profiles, and per-valve differences.

**High-lift profile.** `cams.high` is a second pair of profiles and flow areas above a switch speed, with 150 RPM of hysteresis (VTEC). It replaces 1.12.0's `camSwitch` for builds with profiles; a build cannot have both. The bench shows HIGH CAM while it is engaged.

**Phasers.** `cams.phasers` gives intake and exhaust ranges (crank degrees each way) and a rate (degrees per second, 200 in the presets). The engine-management maps gain Intake cam and Exhaust cam tables by RPM and manifold pressure. Their targets are read at 3 kHz with the other maps, clamped to the range, and the phasers follow at the rate. A positive angle advances the cam: its valve opens and closes earlier. The bench's cam strip shows both angles and the live overlap, and the cutaway's valves and cams move with the same events and phasing.

**Valve float.** The float speed is the build's mechanical limit × the springs' factor × a cam factor. Peak valve acceleration grows with lift and falls with the square of duration, so the factor scales with `(duration / 240°) × √(0.3 d / lift)`, relative to a reference cam. Each spring grade is also designed for a lift (stock 0.30, uprated 0.36, race 0.42 × d). Beyond it, the factor falls with the square of the excess, because the spring runs short of travel. The most aggressive profile, low or high, sets the factor, clamped to 0.6–1.3. On the Road engine with stock springs the factor is 0.99 for the mild grade, 0.90 for fast road and 0.71 for race, so a race cam floats about 28% sooner. Uprated springs bring the race grade back to 1.02. The presets' calibrated profiles sit at 1.00–1.03.

**Valve-to-piston clearance.** Near overlap top dead centre (300–420°), each valve's lift is compared with the room available: half the clearance height (clearance volume ÷ piston area) plus the piston's distance below top dead centre. The worst share is a new stress limit, Valve clearance, which fails within 0.1 s above 100% (valves bent by contact). It is re-evaluated whenever the profile or a phaser moves more than 0.1°. Half the clearance height stands in for valve reliefs and chamber shape; real engines vary widely. A race cam at 11:1 compression is safe unphased but hits the piston when its intake is advanced 60°.

**Two-stage cam (1.12.0).** A build may add `camSwitch`: a second set of intake and exhaust valve areas and intake closing used above a switch speed, dropping back 150 RPM lower. It represents Honda VTEC's lift change, or the two positions of an on/off intake cam phaser. Intake still opens at 350° and the exhaust event keeps its timing, so continuous phasing and overlap changes are not represented. The switch is instantaneous at the step where speed crosses it; if the closing angle moves earlier past a cylinder already in its intake stroke, that cylinder skips one knock and stress cycle. Builds without one are unchanged. The bench shows HIGH CAM while it is engaged.

**Push it.** `PushTest` (`src/sim/push.ts`) holds the applied build at one speed on full throttle in the worker. It settles for 1 s, then raises spark advance (degrees) or the turbo boost target (Pa) by a fixed step every `hold` seconds. Each step records the last 0.5 s's mean torque, boost, the largest knock intensity and ECU retard, and the highest stress share. It stops at the first knock (an unburned share above 3%, the ECU's sensing threshold), at a failure, after 40 steps, or above 50° advance or 4 bar boost. Knock control and parts act as on the bench. Steps of a few seconds are shorter than the crown's 4 s time constant, so temperature limits show up later than they would under a sustained load.

## Live updates

With Live updates on, the bench applies a valid edit about 0.35 s after it is made, without stopping. The AudioWorklet receives a `reconfigure` message and replaces its core with `EngineCore.continueFrom(previous, engine, conditions)`, a new core for the edited definition that carries the running state over:

- the clock, crank angle and speed, controls (including road load) and vehicle speed, coolant, manifold pressure, limiter and starter state, filtered torque, pressure traces and the whole sound state (pipes, filters, exhaust wall temperature, unburned exhaust fuel), with the new definition's exhaust settings applied;
- each cylinder's pressure, temperature, fresh-charge and fuel share, pending heat release and combustion progress, with its gas mass rescaled to the new geometry's volume at the same crank angle;
- induction shaft speed, charge pressure and temperature, wastegate and turbo exhaust-manifold pressure and temperature, when the induction type is unchanged (otherwise the new system starts from rest);
- intake wall film, vapour and accelerator-pump state, when the fuel-system type is unchanged.

Continuing an unchanged build is bit-identical to never stopping (tested). Gas state is carried, not re-solved, so an edit is a step change. For example, a new bore keeps the instantaneous pressure and the engine settles to the new build over the next cycles. An edit that fails validation in the worklet is reported, and the running engine is left as it was. Live edits wait while a live pull, quick test or snapshot audition owns the engine. Stop & rebuild still constructs a fresh, stopped core. Dyno runs always start from a fresh core, so live editing does not change test procedures or results.

## Integration and clocks

The pure core has a fixed 48,000-step/second time contract. Each step is subdivided when necessary to keep crank-angle travel within approximately one degree. Four substeps per time step is a hard computational bound; exceeding it raises an error. Commanded speeds up to the 20,000 RPM limiter need at most three substeps; the four-substep bound corresponds to about 32,000 RPM, above the 25,000 RPM maximum mechanical limit.

Starting uses the build's configurable starter torque (default 70 Nm for builds saved before it existed, 150 Nm for the presets), applied at the crank below 500 RPM; time advancement never divides by RPM. If the starter is engaged but the crank stays below 20 RPM for 0.4 seconds, the core latches a starter-stalled flag, cleared above 200 RPM or on reset. The editor estimates the torque needed to turn the engine over by holding it at 150 RPM with ignition off for one cycle and taking the peak resisting torque. A weaker starter may still start the engine on flywheel momentum, so the estimate is a guide, not a hard threshold. The starter automatically releases after 1.2 seconds on Start. The operator can hold the starter separately. Bench restart explicitly unloads the dyno and releases RPM hold and road load. The limiter latches at the electronic limit and releases 220 RPM below it (see Rev limiter). The UI keeps a recent-cut status visible for 1.5 seconds so normal limiter cycling does not flash the warning.

## Rev limiter

A build's `limiterCut` is `fuel` (the default, and how builds saved before 1.5.0 read) or `spark`. Before 1.5.0 the limiter was described as a fuel cut but only suppressed combustion, so fuel kept flowing and the fuel readout showed it. From 1.5.0:

- **Fuel cut** stops injection while the limiter is latched. Port and throttle-body engines still draw some fuel from the intake wall film, which is mostly too lean to fire. The bench shows LIMITER CUT, hides λ and reports the real (small) fuel flow. Lean misfires during the cut are not flagged as misfires.
- **Spark cut** suppresses ignition and lets the charge through unburned, which can afterfire in a hot exhaust (see Sound). A carburettor cannot stop its fuel, so a carburetted build always cuts the spark.

Torque is cut either way. Dyno procedures stop below the limiter, so their results are unchanged from 1.4.0; after the limiter, the fuel-cut intake film refills, which can briefly lean the mixture.

## Road load

Optional and off by default. The engine drives a vehicle (mass, gear ratios, final drive, tyre rolling radius, drag area CdA and rolling-resistance coefficient; defaults describe a small 1,350 kg six-speed hatchback) through an automatic clutch. The clutch passes torque in proportion to the speed difference across it (150 Nm per rad/s), up to 600 Nm, and its capacity rises from zero at 900 RPM to full at 1,600 RPM. Launches, gear changes and turbo lag under load therefore need no special cases, and a car at rest does not stall the engine. Road resistance is rolling resistance plus aerodynamic drag at ambient air density. Selecting neutral decouples the car, which coasts down. RPM hold and dyno load are disabled while road load is on.

It is a load model for the bench, not a vehicle simulation: no tyre grip or slip, driveline losses, inertia of wheels and driveline, braking or gradients. The bench still reports crank output only; no wheel power is computed. Expect quicker acceleration than a real car with the same crank output. The Road 2.0 build reaches 100 km/h in about 7.3 s when changing up at the limiter (tested range 6–12 s).

The live AudioWorklet uses the audio clock and advances this same core, using a fractional accumulator when the device sample rate differs from 48 kHz. Headless worker batches are capped at 4,800 frames and yield between batches to process cancellation; progress publication is capped at 20 Hz. Run IDs keep late messages from a superseded procedure out of the current result. Node tests advance the identical core. Core state contains no DOM, audio-device or HTTP dependencies.

## Dyno procedures

Both modes use `DynoTest`: a prescribed-speed dyno, with speed-control reaction torque including rotational acceleration. Simulated brake torque comes from cylinder pressure minus empirical friction; absorbed torque is recorded separately. The initial 0.8 seconds settle the starting state. A sweep measures a 0.15-second starting hold, then ramps at the requested rate and records averaged samples every approximately 0.15 seconds. A steady-state test waits at each RPM until adjacent torque windows agree within 4% or 3 Nm, after a minimum settling interval; it aborts if a point fails to settle within four seconds.

**Run-down.** When the pull reaches its end speed, the throttle closes and the dyno brings the engine down at 1,200 RPM per second to the start speed (at least 1,000 RPM). It records 0.15-second samples into the run's separate `rundown` list. Overrun cut, the closing throttle and the falling boost act as they would on the bench, so the samples show engine braking (negative brake torque from friction and pumping) after a brief lift-off transient. Peaks, band power and comparisons use only the pull; the charts draw each run-down dashed. Then the dyno releases the engine and it settles to idle; a live pull hands it back to the bench running. An emergency stop during the run-down keeps the completed pull and notes that the run-down was cut short. Runs recorded before run-downs existed have none. Real dynos vary: some coast down on the roller's inertia, others brake to a set deceleration as here.

Live pull renders the procedure in real time with sound and motion. Quick test calculates it silently in the worker. Neither calculation is driven by React or animation frames. There is currently no replay feature: quick-test progress/results are labelled as calculation. Snapshot audio auditioning is explicitly a fresh simulation at the selected RPM and full throttle, not a recording of a previous run.

Automatic tests own throttle and RPM, disabling conflicting manual controls. Emergency stop and hidden-tab interruption retain incomplete samples and a reason. Completed runs cannot be retroactively aborted. Pausing/closing a bench does not imply server persistence; guest slots use tab-scoped session storage. Recipes are schema-validated, versioned and capped at 50 kB on import.

## Sound and view

Sound is synthesised from the simulated state each 48 kHz step by `src/sim/acoustics.ts`. It reads the core but never changes it: exhaust settings, the listening position and muting leave torque, pressures and mixture bit-identical (tested), and headless quick tests skip it. No sample banks, recordings, impulse responses or third-party sound assets are used. The parts:

- **Exhaust pulses.** Port outflow (or, with a turbo, flow leaving the turbine), scaled inversely with displacement, drives the exhaust path. Each pipe is a feedback comb: the wave returns after one round trip at the speed of sound in the pipe's gas, scaled by both end reflections and damped by a wall-loss low-pass. Headers (closed-ish port against an open collector, round-trip reflection −0.55) give quarter-wave resonances; a 4-2-1 adds a secondary at 0.6 × header length; the system after the collector (open at both ends) gives half-wave resonances. Pipe gas temperature follows the ports' flow-weighted exhaust temperature (headers at 0.85 of it, the rest at 0.55), so resonances shift as the engine warms and loads up. Linear time-invariant equal-length headers are combined into one path because they behave identically.
- **Catalyst and silencer.** A catalyst is a 2.5 kHz low-pass with a 0.8 gain. Straight-through: no silencer, strong tailpipe reflection. Absorptive: 1.6 kHz low-pass. Chambered: a 0.35 m expansion chamber that cancels around its quarter-wave frequency (and odd multiples) while passing low frequencies, then a 900 Hz low-pass. The open end radiates the rate of change of flow.
- **Afterfire.** Fuel leaving the ports unburned (a spark-cut limiter, ignition off, misfires, or fuel beyond the oxygen available) collects in the exhaust and leaves with a 0.1 s time constant. It is weighted by how readily it can burn there: a charge too lean to light in the cylinder counts 3% (10% before 1.6.0; lowered when returned runner residual made fuel-cut limiters pop almost as often as spark cuts), a too-rich one 50%, and fuel left over after normal combustion 30%. A lumped header wall temperature follows the pipe gas with a 3 s lag. Fuel can only burn with the oxygen that leaves with it (4 November 2026): each cylinder also passes on its unused oxygen, counted as the fuel it could burn. That is all of the air from a cut or misfiring charge, the surplus from a lean burn and none from a rich burn. Only the smaller of the two can light. Before this, the excess fuel from steady rich running lit continuously: the Golf preset at λ 0.88 popped about 89 times a second at full throttle, and the hot hatch at λ 1 about 34. Rich running is now quiet, as an oxygen-free exhaust should be, while spark-cut limiters, ignition cuts and misfires still pop. Not modelled: rich exhaust meeting outside air at the tailpipe, or secondary-air injection. Above 600 K (petrol vapour autoignites in air at about 520–550 K) the fuel lights at a deterministic random rate that rises with wall temperature and eightfold while hot (>1,100 K) firing exhaust arrives. Each afterfire is a brief pressure pulse into the headers, so it rings through the same pipes. These thresholds and rates are illustrative; they are not a combustion model of the exhaust.
- **Induction.** Intake runner flow drives a resonance at the quarter-wave frequency of the runner plus 0.25 m of airbox and a broad low-pass, scaled by throttle opening. A nearly closed throttle adds a hiss. The intake path is delayed 2 ms (about 0.7 m of extra distance) so its pulses do not simply cancel the exhaust's.
- **Mechanical.** Each valve seating excites a 3.4 kHz resonance with strength rising with speed squared, and the second difference of summed cylinder pressure (a stand-in for the rate of pressure rise) excites a 1.8 kHz block resonance.
- **Forced induction.** Compressor whistle at shaft rate (blower: six lobes per rotor turn) with a second harmonic, louder with boost; a blow-off valve as a deep thump (a falling 70 Hz pulse and low-passed noise) when it snaps open, then a jet: darkened noise through a band whose centre tracks the pressure being dumped (about 1.75 kHz at full dump, falling towards 450 Hz as it empties), plus a low rumble, with slow random turbulence so it does not sound like static (revised after the user's first listening check); and, with no blow-off valve, compressor surge as noise chopped at a rate that rises with shaft speed.
- **Listening position.** Tailpipe (exhaust dominant), engine bay (intake, mechanical and induction dominant, exhaust heard through a 450 Hz firewall low-pass) and test cell (a mix with a four-comb, two-all-pass Schroeder room reverb). A per-viewer preference, not part of the build.

The sum passes a DC blocker and a `tanh` soft bound at ±0.65, then the Web Audio compressor and master gain. The exhaust system does not change gas exchange, back pressure or power in this model version: the pipes are acoustic only. Wave-tuned breathing needs the quasi-1D pipe solver planned for two-strokes (`docs/TWO_STROKE.md`). `npm run sounds -- <folder>` renders fixed scenarios to WAV files for listening checks.

Three.js generates piston, rod, crank, cylinder sleeve, valve and exhaust-system geometry from the current engine definition (the exhaust glows with the header wall temperature and flashes on afterfire), including compression-dependent head clearance. Camera framing, zoom limits and the floor grid scale with block size. Normal motion extrapolates bounded elapsed time from the latest telemetry snapshot. Normal view uses telemetry; slow-motion inspection is a separate 15-RPM display mode with audio muted. Cylinder pressure traces retain the most recent cycle in two-degree bins. Idle torque/power may fluctuate around zero because these are cycle-smoothed measurements rather than invented positive idle power.

## Host decision and tolerances

Initial supported target: desktop Chromium and Firefox on hardware with Web Audio and WebGL. If WebGL is unavailable, controls/audio/dyno remain usable and the view reports the limitation. More layouts and mobile performance need new measurements.

Use the AudioWorklet-hosted design for the initial inline-four. The worker/ring-buffer fallback remains available as a future architecture change if measured cost grows. Do not infer this decision applies to V8/V12 engines or all devices.

Cross-host acceptance for the same prescribed inputs: RPM difference below 0.01 RPM, torque below 0.01 Nm, instantaneous pressure relative error below 0.01%, angle difference below 0.0003 rad, and two-degree Float32 pressure-trace bins below 0.1% relative error (10 kPa denominator floor). Live/quick controlled-speed samples are checked more tightly, to seven decimal places, on the tested Chromium runtime. These are numerical agreement tolerances, not estimates of real-world accuracy.

1.5.0 sound synthesis adds about 0.015 ms per 128-frame block (Node, 4,000 RPM: 0.071 ms with sound off, 0.086 ms on); the benchmark's worst case, at two substeps, is about 0.16 ms median, 6% of the budget. Headless quick tests skip sound. 1.4.0 adds about 0.01 ms per block for fuel transport. 1.3.0 adds about 0.03 ms per block with a turbo (about 0.016 ms with a supercharger). 1.2.0 increased Node cost per 128-frame block from about 0.045 ms to 0.066 ms at 1,000–7,500 RPM, still under 3% of the 2.67 ms real-time budget. Performance commands: `npm run benchmark` and `npm run test:browser` in `frontend/`. Node reports median/p99/max 128-frame block cost, cost per cylinder-step, substep count and quick-test speed. Browser tests exercise actual workers and AudioWorklets and render real offline PCM. The optional bench diagnostics use a coarse wall-clock timer; they are observations, not a precise real-time profiling guarantee. See `VERIFICATION.md` for measured results and remaining acceptance checks.

## Reference review and attribution

Reviewed Engine Simulator revision [`85f7c3b959a908ed5232ede4f1a4ac7eafe6b630`](https://github.com/ange-yaghi/engine-sim/tree/85f7c3b959a908ed5232ede4f1a4ac7eafe6b630), particularly `src/gas_system.cpp` and `src/combustion_chamber.cpp`, for gas-state, energy/flow accounting and exhaust-driven sound concepts. Its repository's MIT terms must accompany future adapted portions. No source code, C++ library, model script, preset or asset from that project has been copied or mechanically translated into this implementation; it is not a port of that solver.

Physical-equation reference: [NASA Glenn — Mass Flow Choking](https://www.grc.nasa.gov/www/k-12/airplane/mflchk.html). Implementation/API references: [AudioWorklet processing](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process), [Zod JSON Schema export](https://zod.dev/json-schema), [Three.js documentation](https://threejs.org/docs/) and [uPlot](https://github.com/leeoniya/uPlot).
