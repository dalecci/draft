/* ============================================================================
   Ascend — Grade 5 Science (NGSS-aligned scope). Registers as a subject/grade
   in the multi-grade engine. Questions are concept multiple-choice drawn from
   per-topic banks + a few numeric items. Demo content — teacher-vet before use.
   Depends on curriculum.js (mc, pick, randInt, numItem, GEN, CURRICULA, GRADES,
   buildCurriculum).
   ============================================================================ */
(function () {
  const B = {
    practices: [
      { q: 'What is the first step of the scientific method?', a: 'Ask a question', w: ['Draw a conclusion', 'Write a report', 'Buy equipment'] },
      { q: 'A testable statement that predicts an outcome is called a…', a: 'Hypothesis', w: ['Conclusion', 'Theory', 'Fact'] },
      { q: 'In an experiment, the one thing you change on purpose is the…', a: 'Independent variable', w: ['Dependent variable', 'Constant', 'Control group'] },
      { q: 'The factor you measure as the result is the…', a: 'Dependent variable', w: ['Independent variable', 'Hypothesis', 'Constant'] },
      { q: 'Which tool best measures the mass of an object?', a: 'Balance', w: ['Ruler', 'Thermometer', 'Graduated cylinder'] },
      { q: 'Which tool measures the volume of a liquid?', a: 'Graduated cylinder', w: ['Balance', 'Ruler', 'Stopwatch'] },
      { q: 'Which tool measures temperature?', a: 'Thermometer', w: ['Balance', 'Beaker', 'Microscope'] },
      { q: 'To make an experiment fair, you keep everything the same except the…', a: 'Variable being tested', w: ['Results', 'Conclusion', 'Hypothesis'] },
      { q: 'Information collected during an experiment is called…', a: 'Data', w: ['A theory', 'A guess', 'A variable'] },
      { q: 'Repeating an experiment many times makes results more…', a: 'Reliable', w: ['Colorful', 'Expensive', 'Random'] },
    ],
    matter: [
      { q: 'Anything that has mass and takes up space is…', a: 'Matter', w: ['Energy', 'Light', 'Force'] },
      { q: 'The amount of space matter takes up is its…', a: 'Volume', w: ['Mass', 'Weight', 'Density'] },
      { q: 'The amount of matter in an object is its…', a: 'Mass', w: ['Volume', 'Height', 'Color'] },
      { q: 'A property you can observe without changing the substance is a…', a: 'Physical property', w: ['Chemical property', 'Reaction', 'Force'] },
      { q: 'Which is a physical property of a nail?', a: 'It is magnetic', w: ['It rusts', 'It burns', 'It reacts with acid'] },
      { q: 'The measure of how much matter is packed into a space is…', a: 'Density', w: ['Mass', 'Volume', 'Weight'] },
      { q: 'An object that is more dense than water will…', a: 'Sink', w: ['Float', 'Dissolve', 'Evaporate'] },
      { q: 'Which of these is NOT matter?', a: 'Sunlight', w: ['Air', 'Water', 'A rock'] },
    ],
    states: [
      { q: 'Which state of matter has a definite shape and volume?', a: 'Solid', w: ['Liquid', 'Gas', 'Plasma'] },
      { q: 'Which state takes the shape of its container but keeps its volume?', a: 'Liquid', w: ['Solid', 'Gas', 'None'] },
      { q: 'Which state has no definite shape or volume?', a: 'Gas', w: ['Solid', 'Liquid', 'Crystal'] },
      { q: 'Changing from a liquid to a gas is called…', a: 'Evaporation', w: ['Condensation', 'Melting', 'Freezing'] },
      { q: 'Changing from a gas to a liquid is called…', a: 'Condensation', w: ['Evaporation', 'Melting', 'Boiling'] },
      { q: 'Changing from a solid to a liquid is called…', a: 'Melting', w: ['Freezing', 'Condensation', 'Evaporation'] },
      { q: 'Water freezes into ice at what temperature?', a: '0°C (32°F)', w: ['100°C', '10°C', '-100°C'] },
      { q: 'Adding heat to matter makes its particles move…', a: 'Faster', w: ['Slower', 'Backwards', 'They stop'] },
      { q: 'Is melting ice a physical or chemical change?', a: 'Physical change', w: ['Chemical change', 'Nuclear change', 'It is not a change'] },
    ],
    mixtures: [
      { q: 'A combination of substances that can be separated is a…', a: 'Mixture', w: ['Element', 'Compound', 'Atom'] },
      { q: 'A mixture where one substance dissolves evenly in another is a…', a: 'Solution', w: ['Suspension', 'Element', 'Solid'] },
      { q: 'In salt water, the salt is the…', a: 'Solute', w: ['Solvent', 'Mixture', 'Compound'] },
      { q: 'In salt water, the water is the…', a: 'Solvent', w: ['Solute', 'Mixture', 'Element'] },
      { q: 'Which method separates iron filings from sand?', a: 'A magnet', w: ['A filter', 'Evaporation', 'Boiling'] },
      { q: 'Which method best separates salt from salt water?', a: 'Evaporation', w: ['A magnet', 'Filtering', 'Freezing'] },
      { q: 'Which best separates sand from water?', a: 'Filtering', w: ['A magnet', 'Evaporation', 'Stirring'] },
      { q: 'Making a solution is a…', a: 'Physical change', w: ['Chemical change', 'New element', 'Reaction'] },
    ],
    change: [
      { q: 'A change that forms a NEW substance is a…', a: 'Chemical change', w: ['Physical change', 'State change', 'Motion'] },
      { q: 'Which is a chemical change?', a: 'Wood burning', w: ['Ice melting', 'Cutting paper', 'Boiling water'] },
      { q: 'A sign of a chemical change is…', a: 'A new color or gas forms', w: ['Change of shape', 'Change of size', 'It gets wet'] },
      { q: 'Rusting iron is an example of a…', a: 'Chemical change', w: ['Physical change', 'Melting', 'Evaporation'] },
      { q: 'In any change, the total amount of matter (mass) is…', a: 'Conserved (stays the same)', w: ['Destroyed', 'Created', 'Doubled'] },
      { q: 'Baking a cake is mostly a…', a: 'Chemical change', w: ['Physical change', 'Motion', 'State of matter'] },
      { q: 'Crushing a can is a…', a: 'Physical change', w: ['Chemical change', 'New substance', 'Reaction'] },
    ],
    energy: [
      { q: 'Energy is the ability to…', a: 'Do work or cause change', w: ['Take up space', 'Have mass', 'Be solid'] },
      { q: 'Stored energy is called…', a: 'Potential energy', w: ['Kinetic energy', 'Heat energy', 'Light energy'] },
      { q: 'Energy of motion is called…', a: 'Kinetic energy', w: ['Potential energy', 'Stored energy', 'Chemical energy'] },
      { q: 'A stretched rubber band has what kind of energy?', a: 'Potential energy', w: ['Kinetic energy', 'Sound energy', 'No energy'] },
      { q: 'The Sun is Earth’s main source of…', a: 'Energy', w: ['Water', 'Gravity', 'Soil'] },
      { q: 'Energy stored in food and fuel is…', a: 'Chemical energy', w: ['Light energy', 'Sound energy', 'Elastic energy'] },
      { q: 'Energy cannot be created or destroyed, only…', a: 'Transformed', w: ['Deleted', 'Made', 'Weighed'] },
      { q: 'A moving roller coaster has mostly what energy at the bottom of a hill?', a: 'Kinetic energy', w: ['Potential energy', 'Chemical energy', 'No energy'] },
    ],
    lightsound: [
      { q: 'Light travels in…', a: 'Straight lines', w: ['Curves', 'Circles', 'Zigzags always'] },
      { q: 'When light bounces off a surface it is…', a: 'Reflected', w: ['Refracted', 'Absorbed', 'Created'] },
      { q: 'When light bends passing through water it is…', a: 'Refracted', w: ['Reflected', 'Absorbed', 'Destroyed'] },
      { q: 'A material you can see clearly through is…', a: 'Transparent', w: ['Opaque', 'Translucent', 'Reflective'] },
      { q: 'Sound is made by…', a: 'Vibrations', w: ['Light', 'Heat only', 'Gravity'] },
      { q: 'Sound needs a ___ to travel.', a: 'Medium (like air)', w: ['Vacuum', 'Mirror', 'Battery'] },
      { q: 'A high-pitched sound has a ___ frequency.', a: 'High', w: ['Low', 'Zero', 'Negative'] },
      { q: 'Sound travels fastest through…', a: 'Solids', w: ['Air', 'A vacuum', 'Empty space'] },
      { q: 'We see most objects because they ___ light.', a: 'Reflect', w: ['Create', 'Eat', 'Freeze'] },
    ],
    heatelec: [
      { q: 'Heat always moves from ___ objects to ___ objects.', a: 'Hot to cold', w: ['Cold to hot', 'Big to small', 'Light to dark'] },
      { q: 'A material that lets heat/electricity pass through easily is a…', a: 'Conductor', w: ['Insulator', 'Magnet', 'Resistor'] },
      { q: 'A material that does NOT let heat/electricity pass easily is an…', a: 'Insulator', w: ['Conductor', 'Metal', 'Wire'] },
      { q: 'Which is the best conductor of electricity?', a: 'Copper wire', w: ['Rubber', 'Wood', 'Plastic'] },
      { q: 'For a bulb to light, the circuit must be…', a: 'Complete (closed)', w: ['Open', 'Broken', 'Empty'] },
      { q: 'A switch turned OFF makes the circuit…', a: 'Open (no flow)', w: ['Closed', 'Faster', 'Brighter'] },
      { q: 'Which is a good heat insulator?', a: 'A wool blanket', w: ['A metal spoon', 'A copper pan', 'An iron rod'] },
      { q: 'Electric current flows through a…', a: 'Conductor', w: ['Insulator', 'Vacuum', 'Magnet field only'] },
    ],
    forces: [
      { q: 'A push or a pull is a…', a: 'Force', w: ['Mass', 'Volume', 'Cell'] },
      { q: 'The force that pulls objects toward Earth is…', a: 'Gravity', w: ['Friction', 'Magnetism', 'Electricity'] },
      { q: 'A force that slows objects sliding against each other is…', a: 'Friction', w: ['Gravity', 'Magnetism', 'Momentum'] },
      { q: 'An object at rest stays at rest unless a ___ acts on it.', a: 'Force', w: ['Color', 'Smell', 'Cell'] },
      { q: 'More friction is created by a ___ surface.', a: 'Rough', w: ['Smooth', 'Wet', 'Icy'] },
      { q: 'Speed is distance divided by…', a: 'Time', w: ['Mass', 'Force', 'Weight'] },
      { q: 'Balanced forces on an object cause…', a: 'No change in motion', w: ['It to speed up', 'It to stop suddenly', 'It to fly'] },
      { q: 'Which increases an object’s speed?', a: 'An unbalanced force pushing it', w: ['Balanced forces', 'More friction', 'Nothing'] },
    ],
    earthweather: [
      { q: 'The layer of gases around Earth is the…', a: 'Atmosphere', w: ['Hydrosphere', 'Geosphere', 'Biosphere'] },
      { q: 'All the water on Earth makes up the…', a: 'Hydrosphere', w: ['Atmosphere', 'Geosphere', 'Ozone'] },
      { q: 'The day-to-day condition of the atmosphere is…', a: 'Weather', w: ['Climate', 'Season', 'Orbit'] },
      { q: 'The average weather over many years is…', a: 'Climate', w: ['Weather', 'A storm', 'A front'] },
      { q: 'Most of Earth’s surface is covered by…', a: 'Salt water (oceans)', w: ['Fresh water', 'Land', 'Ice'] },
      { q: 'A scientist who studies weather is a…', a: 'Meteorologist', w: ['Geologist', 'Biologist', 'Astronomer'] },
      { q: 'Which cloud usually brings thunderstorms?', a: 'Cumulonimbus', w: ['Cirrus', 'Stratus wisps', 'Fog'] },
    ],
    watercycle: [
      { q: 'The Sun’s heat turns water into vapor by…', a: 'Evaporation', w: ['Condensation', 'Precipitation', 'Collection'] },
      { q: 'Water vapor cooling into clouds is…', a: 'Condensation', w: ['Evaporation', 'Runoff', 'Melting'] },
      { q: 'Rain, snow, and hail are all forms of…', a: 'Precipitation', w: ['Evaporation', 'Condensation', 'Transpiration'] },
      { q: 'Water plants release into the air is called…', a: 'Transpiration', w: ['Precipitation', 'Runoff', 'Erosion'] },
      { q: 'The water cycle is powered mainly by the…', a: 'Sun', w: ['Moon', 'Wind only', 'Rivers'] },
      { q: 'Water moving over land into rivers is called…', a: 'Runoff', w: ['Evaporation', 'Condensation', 'Freezing'] },
    ],
    rocks: [
      { q: 'Rock formed from cooled magma or lava is…', a: 'Igneous', w: ['Sedimentary', 'Metamorphic', 'Mineral'] },
      { q: 'Rock formed from layers of sediment pressed together is…', a: 'Sedimentary', w: ['Igneous', 'Metamorphic', 'Lava'] },
      { q: 'Rock changed by heat and pressure is…', a: 'Metamorphic', w: ['Igneous', 'Sedimentary', 'Fossil'] },
      { q: 'The wearing away of rock by wind and water is…', a: 'Erosion / weathering', w: ['Deposition', 'Melting', 'Condensation'] },
      { q: 'The remains of ancient living things in rock are…', a: 'Fossils', w: ['Crystals', 'Minerals', 'Magma'] },
      { q: 'Soil is made of tiny bits of rock plus…', a: 'Decayed plants and animals', w: ['Only sand', 'Plastic', 'Water only'] },
    ],
    space: [
      { q: 'The star at the center of our solar system is the…', a: 'Sun', w: ['Moon', 'Earth', 'Mars'] },
      { q: 'How many planets orbit the Sun?', a: '8', w: ['9', '7', '12'] },
      { q: 'Earth spinning on its axis causes…', a: 'Day and night', w: ['The seasons', 'Moon phases', 'Tides only'] },
      { q: 'Earth orbiting the Sun once takes about…', a: '1 year', w: ['1 day', '1 month', '1 week'] },
      { q: 'The Moon appears to change shape because of…', a: 'Its phases (position vs the Sun)', w: ['Clouds', 'Its own light', 'Earth’s shadow always'] },
      { q: 'The tilt of Earth’s axis causes the…', a: 'Seasons', w: ['Day and night', 'Moon phases', 'Eclipses'] },
      { q: 'The Moon does not make its own light; it ___ the Sun’s light.', a: 'Reflects', w: ['Creates', 'Absorbs all', 'Blocks'] },
      { q: 'A huge system of billions of stars is a…', a: 'Galaxy', w: ['Planet', 'Comet', 'Moon'] },
    ],
    cells: [
      { q: 'The basic building block of all living things is the…', a: 'Cell', w: ['Atom', 'Molecule', 'Organ'] },
      { q: 'Which part controls the cell and holds its DNA?', a: 'Nucleus', w: ['Cell wall', 'Cytoplasm', 'Vacuole'] },
      { q: 'Which part is found in PLANT cells but not animal cells?', a: 'Cell wall', w: ['Nucleus', 'Cell membrane', 'Cytoplasm'] },
      { q: 'Living things that are made of many cells are…', a: 'Multicellular', w: ['Unicellular', 'Nonliving', 'Minerals'] },
      { q: 'To be classified as living, an organism must…', a: 'Grow, use energy, and reproduce', w: ['Be big', 'Move fast', 'Be green'] },
      { q: 'The part that controls what enters and leaves a cell is the…', a: 'Cell membrane', w: ['Nucleus', 'Vacuole', 'Cell wall'] },
    ],
    plants: [
      { q: 'The process plants use to make food from sunlight is…', a: 'Photosynthesis', w: ['Respiration', 'Digestion', 'Evaporation'] },
      { q: 'Photosynthesis takes place mainly in the…', a: 'Leaves', w: ['Roots', 'Flowers', 'Bark'] },
      { q: 'Plants take in which gas for photosynthesis?', a: 'Carbon dioxide', w: ['Oxygen', 'Nitrogen', 'Helium'] },
      { q: 'Plants release which gas during photosynthesis?', a: 'Oxygen', w: ['Carbon dioxide', 'Hydrogen', 'Methane'] },
      { q: 'The green pigment that captures sunlight is…', a: 'Chlorophyll', w: ['Chloroplast', 'Nectar', 'Pollen'] },
      { q: 'Which plant part absorbs water and nutrients?', a: 'Roots', w: ['Leaves', 'Flowers', 'Seeds'] },
      { q: 'The sugar plants make for food is…', a: 'Glucose', w: ['Salt', 'Protein', 'Water'] },
    ],
    ecosystems: [
      { q: 'An organism that makes its own food is a…', a: 'Producer', w: ['Consumer', 'Decomposer', 'Predator'] },
      { q: 'An animal that eats other organisms is a…', a: 'Consumer', w: ['Producer', 'Decomposer', 'Plant'] },
      { q: 'Organisms that break down dead things are…', a: 'Decomposers', w: ['Producers', 'Predators', 'Herbivores'] },
      { q: 'An animal that eats only plants is a…', a: 'Herbivore', w: ['Carnivore', 'Omnivore', 'Decomposer'] },
      { q: 'A food chain always starts with a…', a: 'Producer (plant)', w: ['Carnivore', 'Decomposer', 'Predator'] },
      { q: 'The arrows in a food chain show the flow of…', a: 'Energy', w: ['Water', 'Air', 'Soil'] },
      { q: 'All the living and nonliving things in an area make up an…', a: 'Ecosystem', w: ['Organ', 'Cell', 'Atom'] },
      { q: 'A trait that helps an organism survive is an…', a: 'Adaptation', w: ['Accident', 'Instinct only', 'Extinction'] },
    ],
    body: [
      { q: 'Which body system carries blood, oxygen, and nutrients?', a: 'Circulatory system', w: ['Digestive system', 'Nervous system', 'Skeletal system'] },
      { q: 'Which system takes in oxygen and removes carbon dioxide?', a: 'Respiratory system', w: ['Circulatory system', 'Digestive system', 'Muscular system'] },
      { q: 'Which system breaks down food?', a: 'Digestive system', w: ['Respiratory system', 'Nervous system', 'Skeletal system'] },
      { q: 'The organ that pumps blood is the…', a: 'Heart', w: ['Lungs', 'Brain', 'Stomach'] },
      { q: 'The organ that controls the body and thinking is the…', a: 'Brain', w: ['Heart', 'Liver', 'Lungs'] },
      { q: 'Traits passed from parents to offspring are…', a: 'Inherited', w: ['Learned', 'Random', 'Bought'] },
      { q: 'Which of these is a LEARNED behavior, not inherited?', a: 'Riding a bike', w: ['Eye color', 'Height', 'Hair color'] },
      { q: 'Bones and the skeleton belong to the…', a: 'Skeletal system', w: ['Digestive system', 'Respiratory system', 'Circulatory system'] },
    ],
  };
  function bank(key) { return function () { const it = pick(B[key]); return mc(it.q, it.a, it.w, it.e || `Correct: ${it.a}.`); }; }
  const SCI_GEN = {
    sci_practices: bank('practices'), sci_matter: bank('matter'), sci_states: bank('states'), sci_mixtures: bank('mixtures'),
    sci_change: bank('change'), sci_energy: bank('energy'), sci_lightsound: bank('lightsound'), sci_heatelec: bank('heatelec'),
    sci_forces: bank('forces'), sci_earthweather: bank('earthweather'), sci_watercycle: bank('watercycle'), sci_rocks: bank('rocks'),
    sci_space: bank('space'), sci_cells: bank('cells'), sci_plants: bank('plants'), sci_ecosystems: bank('ecosystems'), sci_body: bank('body'),
    // a couple of numeric science-skills items
    sci_speed: function () { const d = randInt(2, 12) * randInt(2, 9), t = randInt(2, 9); const dist = d, time = t; return numItem(`An animal runs ${dist} meters in ${time} seconds. What is its speed in meters per second?`, +(dist / time).toFixed(2), `speed = distance ÷ time = ${dist} ÷ ${time}.`, 0.05); },
    sci_convert: function () { const kind = pick([['centimeters are in ' , 100, 'meter', 'meters'], ['grams are in ', 1000, 'kilogram', 'kilograms'], ['milliliters are in ', 1000, 'liter', 'liters']]); const n = randInt(2, 9); return numItem(`How many ${kind[0]}${n} ${kind[3]}?`, n * kind[1], `${n} × ${kind[1]} = ${n * kind[1]}.`); },
  };

  const U = [
    ['A', 'Science practices & measurement', ['Steps of the scientific method', 'Variables in an experiment', 'Fair tests and controls', 'Science tools', 'Metric measurement', 'Collecting and using data']],
    ['B', 'Properties of matter', ['What is matter?', 'Mass, volume, and weight', 'Physical properties', 'Density: sink or float', 'Measuring matter']],
    ['C', 'States & changes of matter', ['Solids, liquids, and gases', 'Melting and freezing', 'Evaporation and condensation', 'Particles and temperature', 'Physical vs. chemical change']],
    ['D', 'Mixtures & solutions', ['Mixtures', 'Solutions: solute & solvent', 'Separating mixtures', 'Dissolving']],
    ['E', 'Chemical changes', ['Signs of a chemical change', 'Chemical vs. physical change', 'Conservation of mass']],
    ['F', 'Energy', ['What is energy?', 'Potential and kinetic energy', 'Forms of energy', 'Energy transformations', 'The Sun as an energy source']],
    ['G', 'Light & sound', ['How light travels', 'Reflection and refraction', 'Transparent, translucent, opaque', 'Sound and vibrations', 'Pitch and how sound travels']],
    ['H', 'Heat & electricity', ['Heat transfer', 'Conductors and insulators', 'Electric circuits', 'Switches and circuits']],
    ['I', 'Forces & motion', ['Forces: push and pull', 'Gravity', 'Friction', 'Balanced and unbalanced forces', 'Speed and motion']],
    ['J', 'Earth & weather', ['Earth’s systems', 'Weather vs. climate', 'Clouds and storms', 'Earth’s water'] ],
    ['K', 'The water cycle', ['Evaporation and condensation', 'Precipitation', 'Runoff and transpiration', 'What powers the water cycle']],
    ['L', 'Rocks, soil & change', ['Three types of rock', 'Weathering and erosion', 'Fossils', 'Soil']],
    ['M', 'Space & the solar system', ['The Sun and planets', 'Day and night', 'Seasons', 'Moon phases', 'Stars and galaxies']],
    ['N', 'Cells & living things', ['Cells: building blocks', 'Parts of a cell', 'Plant vs. animal cells', 'Characteristics of living things']],
    ['O', 'Plants', ['Photosynthesis', 'Parts of a plant', 'Gases plants use and release', 'Chlorophyll and sunlight']],
    ['P', 'Ecosystems', ['Producers, consumers, decomposers', 'Food chains and webs', 'Ecosystems', 'Adaptations']],
    ['Q', 'Human body & heredity', ['Body systems', 'The heart and circulation', 'Breathing and digestion', 'Inherited vs. learned traits']],
  ];
  function pickGenSci(unitId, name) {
    const s = name.toLowerCase(); const has = (...w) => w.some(x => s.includes(x));
    if (has('scientific method', 'variable', 'fair test', 'control', 'tools', 'data')) return 'sci_practices';
    if (has('metric', 'measurement')) return 'sci_convert';
    if (has('density', 'sink')) return 'sci_matter';
    if (has('matter', 'mass', 'volume', 'physical properties', 'measuring matter')) return 'sci_matter';
    if (has('solid', 'liquid', 'gas', 'melt', 'freez', 'evaporat', 'condens', 'particle')) return 'sci_states';
    if (has('mixture', 'solution', 'solute', 'solvent', 'separat', 'dissolv')) return 'sci_mixtures';
    if (has('chemical', 'conservation of mass', 'signs of')) return 'sci_change';
    if (has('energy', 'kinetic', 'potential', 'sun as')) return 'sci_energy';
    if (has('light', 'reflect', 'refract', 'transparent', 'sound', 'pitch', 'vibrat')) return 'sci_lightsound';
    if (has('heat', 'conductor', 'insulator', 'circuit', 'switch', 'electric')) return 'sci_heatelec';
    if (has('force', 'gravity', 'friction', 'motion', 'speed', 'balanced')) return has('speed') ? 'sci_speed' : 'sci_forces';
    if (has('water cycle', 'evaporation and condensation', 'precipitation', 'runoff', 'transpiration', 'powers')) return 'sci_watercycle';
    if (has('weather', 'climate', 'cloud', 'storm', 'earth’s water', 'earth systems', 'earth’s systems')) return 'sci_earthweather';
    if (has('rock', 'weathering', 'erosion', 'fossil', 'soil')) return 'sci_rocks';
    if (has('sun and planet', 'planet', 'day and night', 'season', 'moon', 'star', 'galax', 'solar')) return 'sci_space';
    if (has('cell', 'living things')) return 'sci_cells';
    if (has('photosynthesis', 'plant', 'chlorophyll', 'gases plants')) return 'sci_plants';
    if (has('producer', 'consumer', 'decomposer', 'food chain', 'ecosystem', 'adaptation')) return 'sci_ecosystems';
    if (has('body', 'heart', 'circulation', 'breath', 'digest', 'inherit', 'trait')) return 'sci_body';
    const byUnit = { A: 'sci_practices', B: 'sci_matter', C: 'sci_states', D: 'sci_mixtures', E: 'sci_change', F: 'sci_energy', G: 'sci_lightsound', H: 'sci_heatelec', I: 'sci_forces', J: 'sci_earthweather', K: 'sci_watercycle', L: 'sci_rocks', M: 'sci_space', N: 'sci_cells', O: 'sci_plants', P: 'sci_ecosystems', Q: 'sci_body' };
    return byUnit[unitId] || 'sci_practices';
  }

  // register into the multi-grade engine
  Object.assign(GEN, SCI_GEN);
  CURRICULA.sci5 = buildCurriculum('Grade 5 Science', 'NGSS-aligned scope · concept practice', U, pickGenSci);
  GRADES.push({ id: 'sci5', label: 'Gr 5 Science', short: 'SCI' });
})();
