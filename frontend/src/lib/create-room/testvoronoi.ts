export type BinaryOperator = (a: number, b: number) => number;
export const bop = (bop: BinaryOperator, a: vec2, b: vec2) => [bop(a[0], b[0]), bop(a[1], b[1])] as vec2;
export const sbop = (bop: BinaryOperator, a: vec2, s: number) => a.map(e => bop(e, s)) as vec2;

export const add = bop.bind(null, (a, b) => a + b);
export const mul = bop.bind(null, (a, b) => a * b);
export const sub = bop.bind(null, (a, b) => a - b);

export type vec<L extends number, T extends number[] = []> =
    T extends { length: L } ? T : vec<L, [...T, number]>;
export type Rectangle = [vec2, vec2];
export type vec2 = vec<2>;
import * as d3 from "d3-delaunay";

class Random {
  state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  nextInterval(min: number, max: number): number {
    return min + ((this.next() + this.next() + this.next() + this.next()) / 4) * (max - min);
  }

  next() {
    const n = 1e4 * Math.sin(this.state);
    this.state += 1;
    return n - Math.floor(n);
  }
}

function poissonDiscSampler(width: number, height: number, radius: number, random: Random): vec2[] {
    const k = 30;
    const radius2 = radius * radius;
    const R = 3 * radius2;
    const cellSize = radius * Math.SQRT1_2;
    const gridWidth = Math.ceil(width / cellSize);
    const gridHeight = Math.ceil(height / cellSize);
    const grid = new Array(gridWidth * gridHeight);
    const queue: vec2[] = [];
    const result: vec2[] = [];

    function emit(x: number, y: number) {
        const s: vec2 = [x, y];
        queue.push(s);
        result.push(s);
        grid[gridWidth * ((y / cellSize) | 0) + ((x / cellSize) | 0)] = s;
        return s;
    }

    emit(random.next() * width, random.next() * height);

    while (queue.length) {
        const i: number = (random.next() * queue.length) | 0;
        const s: vec2 = queue[i];

        let accepted = false;
        for (let j = 0; j < k; ++j) {
            const a = 2 * Math.PI * random.next();
            const r = Math.sqrt(random.next() * R + radius2);
            const x = s[0] + r * Math.cos(a);
            const y = s[1] + r * Math.sin(a);

            if (0 <= x && x < width && 0 <= y && y < height) {
                const gx = (x / cellSize) | 0;
                const gy = (y / cellSize) | 0;
                let farEnough = true;

                for (let dx = -1; dx <= 1; ++dx) {
                    if (!farEnough) break;
                    for (let dy = -1; dy <= 1; ++dy) {
                        const neighbor: vec2 | undefined = grid[gridWidth * (gy + dy) + (gx + dx)];
                        if (neighbor) {
                            const dx2 = neighbor[0] - x;
                            const dy2 = neighbor[1] - y;
                            if (dx2 * dx2 + dy2 * dy2 < radius2) {
                                farEnough = false;
                                break;
                            }
                        }
                    }
                }

                if (farEnough) {
                    accepted = true;
                    emit(x, y);
                    break;
                }
            }
        }

        if (!accepted) {
            queue[i] = queue[queue.length - 1];
            queue.pop();
        }
    }
    return result;
}

// compat flag to remain compatible with old voronoi generation for a while, can be removed after the new one is tested in production for a bit
export const tesselateSurface = (width: number, height: number, targetCount: number, seed: number = 45, customSites?: vec2[]) => {
    const random = new Random(seed);

    // Heuristic: r approx sqrt(Area / (N * 1.6))
    let r = Math.sqrt((width * height) / (targetCount * 1.6));
    let realPoints = [];
    let bestDiff = Infinity;
    let bestPoints: vec2[] = [];

    const MAX_ITERATIONS = 5;

    if (customSites && customSites.length > 0) {
        bestPoints = customSites;
    } else {
        for (let i = 0; i < MAX_ITERATIONS; i++) {
            const attempt = poissonDiscSampler(width, height, r, random);
            const count = attempt.length;
            const diff = Math.abs(count - targetCount);

            if (diff < bestDiff) {
                bestDiff = diff;
                bestPoints = attempt;
            }

            // Dampened feedback loop
            const ratio = Math.sqrt(count / targetCount);
            r = r * ((ratio + 1) / 2);
        }
    }

    realPoints = bestPoints;
    targetCount = realPoints.length;

    // do a second pass with the ghosts to fill in the rest of the cells
    let points = realPoints;
    let delaunay = d3.Delaunay.from(points);
    let voronoi = delaunay.voronoi([0, 0, width, height]);

    const returnData: {
        segments: { neighborIndex?: number; }[];
        geometry: vec2[];
        site: vec2;
        neighbors: { id: number; relativePosition: vec2 }[]
    }[] = [];

    for (let i = 0; i < targetCount; i++) {
        const site = realPoints[i];
        const neighborsIds = [...delaunay.neighbors(i)];
        // this maps the segment with the neighbor, if the neighbor is outside the bounds, it's undefined
        const segmentToNeighbor: (number | undefined)[] = [];

        const poly = voronoi.cellPolygon(i);
        if (!poly) continue;

        let ptr = 0;
        const comps = [width, height]

        /*
        - Take all segments
        - For each segment, get it's midpoint
        - for each midpoint, move it two times further from the site
        - find the closest site to this new point
        - if delaunay.find returns an index inside the neighborsIds array, it's not clipped, otherwise it is
        */
        const EPS = 1e-1; // Epsilon for coordinate comparison
        const DIST_EPS = 1; // Epsilon for squared distance comparison (looser due to large coordinates)

        const clip = { x: 0, y: 0, width, height };
        const distSq = (p1: vec2, p2: vec2) => (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2;

        const isBoundaryEdge = (p1: vec2, p2: vec2) => {
            // Check X boundaries
            if (Math.abs(p1[0] - p2[0]) < EPS) {
                if (Math.abs(p1[0] - clip.x) < EPS || Math.abs(p1[0] - (clip.x + clip.width)) < EPS) return true;
            }
            // Check Y boundaries
            if (Math.abs(p1[1] - p2[1]) < EPS) {
                if (Math.abs(p1[1] - clip.y) < EPS || Math.abs(p1[1] - (clip.y + clip.height)) < EPS) return true;
            }
            return false;
        };

        for (let j = 0; j < poly.length - 1; j++) {
            const p1 = poly[j];
            const p2 = poly[j + 1];

            // If this edge is part of the clipping box, it doesn't lead to a Delaunay neighbor
            if (isBoundaryEdge(p1, p2)) {
                // We could store { p1, p2, neighbor: -1 } here if we wanted to track walls
                segmentToNeighbor.push(undefined);
                continue;
            }

            // Calculate midpoint of the edge
            const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2] as vec2;

            // The edge lies on the bisector between activeSite and the correct neighbor.
            // Therefore, the midpoint must be equidistant to activeSite and the neighborSite.
            const dSite = distSq(mid, site);

            let bestNeighbor: number | undefined;
            let bestDiff = Infinity;

            for (const k of neighborsIds) {
                const nSite = points[k];
                const dNeighbor = distSq(mid, nSite);
                const diff = Math.abs(dSite - dNeighbor);

                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestNeighbor = k;
                }
            }

            if (bestDiff < 1.0 && bestNeighbor !== undefined) {
                segmentToNeighbor.push(bestNeighbor);
            } else {
                segmentToNeighbor.push(undefined);
            }
        }
        // segmentToNeighbor.push(...neighborsIds.slice(ptr))

        // --- FIX 2: Pass bounds to helper for clipping ---
        const segments: {
            neighborIndex?: number | undefined;
        }[] = segmentToNeighbor.map((neighborIndex) => ({ neighborIndex }));

        poly.forEach((p) => {
            p[0] -= site[0];
            p[1] -= site[1];
        });

        const neighbors = segmentToNeighbor
            .filter((id) => id !== undefined)
            .map((id) => {
                const nsite: vec2 = realPoints[id];
                return ({
                    id,
                    relativePosition: sub(nsite, site),
                })
            });

        returnData.push({ segments, geometry: poly, site, neighbors });
    }
    return returnData;
}

let set = {"height":1939.8682042833607,"width":1500,"imageWidth":1214,"imageHeight":1570,"image":"91/07/910703569726f56e6d6d9646066847b1.png","isvideo":false,"cols":1,"rows":1,"pieceWidth":1,"pieceHeight":1,"sites":[[1258.5961778047745,1787.153642595842],[433.3478630687748,2019.6125699225377],[602.3995918579735,827.9788940620374],[1372.5871125191138,1217.450611745979],[1621.3793774517244,1728.0123838331028],[505.8489034078289,201.98878944715713],[1419.5512446608225,1985.7062705625779],[298.5630155088037,656.1692834609511],[1005.3331799188635,1206.378809803055],[850.3017660112114,192.339230527036],[1093.2566222771884,299.98469306674104],[704.0223800470218,644.4305345144178],[538.7957028094922,386.7229850545536],[363.8634365690715,1071.362029395562],[1280.7361446961006,295.7545702588019],[509.10773068670517,446.5284618368556],[857.4739106146567,146.4166328447822],[1142.6608985293697,1088.2660241927417],[908.2299974895669,468.60920455771804],[1288.6576345723229,1505.8865732554013],[1207.182665349389,686.3534748845616],[710.4857357251625,1356.0938946111307],[640.4362509815552,680.7607051455793],[357.4810452202256,1035.016552276014],[404.14815693729645,1088.314951352697],[95.92159652053606,918.7094140250151],[1219.1944786842655,1709.8802989608046],[898.356875589608,1082.8890455727792],[883.1378616352545,686.8866575117685],[8.788662985544697,983.6039999692235],[673.0834143003864,1265.208715695296],[1090.1337320336352,1731.4540418398515],[698.9796280556375,413.0860233281044],[617.2795016605561,682.6002481493666],[1112.1902237766726,1140.0693727124753],[1150.7013714346047,1177.8781691044348],[1427.0731197267605,346.3422710873884],[1142.1477095394616,1637.0469203442149],[834.644563317724,1001.9577956037191],[496.05913085633387,1136.0129931363913],[239.55334152934955,722.4947589770251],[462.123743705587,2052.9212420044355],[937.2663486403363,1696.3871904702246],[1388.5778420635872,1848.5115352194732],[312.70862709372955,1424.5676101271251],[214.0916358859598,1873.4320659034443],[621.9328249497848,232.8154721819104],[392.023475993139,1108.6492463584277],[576.478546202991,316.6760904757909],[1284.777273121415,424.99930151251556],[615.1999360977745,12.650125302324378],[803.1355965955004,1136.3019173998632],[1656.4153659392,962.8618025758243],[84.670903402289,1217.4041816152833],[1610.3639311335414,683.1211895092853],[756.595525986586,423.78160885575704],[1189.4476986628006,1243.9945221151631],[676.5456758626866,496.71678254714544],[2.6426478865607748,2103.4527441568403],[703.4504954051395,1611.6342199482576],[703.3913128590125,684.2315555798344],[1498.7941652312802,2111.491341317696],[268.60004789890104,890.4612532665592],[408.1612236499103,694.0121135055628],[1385.4173879280304,859.2502371336125],[414.49609368233433,603.7019752864541],[1452.7088663686025,976.282441685489],[1275.0624860763924,142.9784834424091],[1508.9252163084973,214.99709259552625],[821.6456413591418,57.944612860869086],[1469.2437150710987,1889.7757030662494],[87.02066942603386,979.6186993995848],[853.3635276813947,1184.7539956432051],[199.76070640131087,1709.9600633703835],[930.9521768633288,82.91960462503606],[1636.252248534147,667.4692956392482],[752.928298032561,1524.274155363724],[1405.9538856627837,1739.4476351394355],[1166.5459158558679,1123.5542800883854],[1296.7151455659116,796.0231194013647],[195.66658530214016,49.17127097820979],[1084.152171138026,756.6522806096035],[731.3319866466412,36.80508269609277],[1431.9174614469493,1315.1484843908336],[516.8576203639567,271.04477963052557],[1144.1628312771356,345.39490112418196],[1638.8769572567764,1307.2000299846818],[260.385029047884,505.6115968397257],[1507.0497981366245,671.6490263033544],[1220.729435066261,1496.0340298476276],[544.7845948663852,1315.6305156561489],[841.820946427663,1850.560458004962],[180.92151135787947,1442.9343249429887],[245.58080831103956,1055.7728015337627],[64.53656927711009,1858.5957386230832],[169.67522913612595,1563.1937421731025],[1267.9113022275255,1458.1316448402674],[765.7929269003725,1038.972072630332],[915.2794156610887,1132.5445105261836],[1071.1757374187507,96.76324135110453],[431.7677547353987,997.0686815838976],[593.5126438233583,1644.962103578889],[940.4537119319908,1965.289453951354],[1462.3369338539574,2140.3087004570025],[782.2118035399974,1784.8075802256826],[1160.642803993951,1654.3871128274927],[138.12696319550153,96.9501573943564],[1114.8684157769273,1045.377517439311],[1075.135719680127,605.6604540309268],[565.0298597001336,2048.5347256109526],[514.6198140491159,2141.014418982108],[84.36667058784865,692.269541981554],[1491.4607253568668,923.5122998991666],[1574.6168976141532,158.13514738733147],[1576.0067087485672,401.18899140899833],[925.8596557959409,367.672626741148],[1506.6943551020797,206.72746738556384],[401.7581640422813,500.9394413843179],[813.8766401823788,122.06055835135426],[498.1244360875362,812.1599259766],[1350.6407109321476,716.8835326805145],[644.0900955390341,1774.8437738807202],[1212.202270050945,788.638783114835],[1516.5264255137247,68.6770764466056],[239.64524943929862,731.9350815671265],[340.9481805535436,1665.7496415650799],[775.309728532473,1091.3334776037732],[280.34834060030533,2145.090889160974],[1009.5986432503473,1459.1746347113988],[988.8037866195224,2066.242493140626],[207.55574198916807,1767.1961942054766],[856.5847290809984,2140.7346647212516],[372.97330816543587,2098.379352453539],[637.552757036364,1028.4798025915873],[1663.8164348593782,1801.6708398222827],[485.3304212186056,1159.211413615805],[430.1140904249197,500.47635031613083],[22.40494396697308,1130.5025624069413],[986.259930470167,1438.6669846592397],[374.0302334801125,684.4700697050387],[1624.7113957953793,1096.3208890860558],[1561.096631543633,1627.4145851006313],[1468.1955907082033,179.30754579019575],[1068.8099530979284,1431.423092990838],[922.9858926537812,1968.1777658697388],[741.9542884921101,1091.479726363146],[476.23627762662994,953.8144329759626],[376.1647118727199,222.4985425804623],[1362.6626189267972,1516.5805322904691],[1213.5963910498285,296.81856148423316],[706.2282800660314,265.38371904778836],[888.290348292045,1810.8850096805004],[433.23036485972295,1383.076395256887],[736.8927876541009,1911.4052423354328],[1271.2577558309363,948.3829749319357],[326.8161961022001,1739.7268195944896],[462.5053447132818,886.5141157871666],[1486.2851456059016,2038.0964597157993],[237.7470878026227,396.4085530255043],[370.4999243864552,1007.6969541879022],[540.0391300554221,1285.745952934545],[1507.9952890885475,1368.6583437121953],[850.5522533457461,703.6009369764089],[825.4305009086739,629.9133124232209],[823.0522616203539,1100.9906820943618],[1077.2585986565887,851.2694754511325],[919.1346182169016,1121.5290838818757],[1020.8622082695945,1768.38809380452],[1037.3834163092736,1992.8586572830459],[526.7199140317321,214.33683570299235],[575.7612707324191,1585.2971331768485],[165.14823176706042,1539.4670620765944],[358.4392719135936,858.1938856065503],[616.3346571026017,445.56981883450425],[1612.8127611671387,1973.5854772770897],[153.0709067052539,576.098671260827],[836.980032917695,980.0423903397653],[999.2704754173692,429.46281886791917],[1554.0393358695674,626.146182787578],[840.790737656589,2069.970301466944],[659.3126761738627,1296.60334443227],[1635.8036764443443,1219.0715079293054],[867.0806852208377,745.2928533409024],[487.48313444115394,1216.427952273536],[776.1046952166338,1804.8310192275635],[1138.2153108554123,2043.0244917284979],[592.0630451848275,1836.6644185784678],[1222.2185003422142,602.6615400423532],[336.04440641308946,1801.7563728202613],[523.6181547314296,1172.4044644544815],[375.08299796560937,1470.7014583566718],[1233.3608492441774,1664.5927581937312],[577.7679330728548,829.5062250271455],[197.31322118563565,843.0975664942554],[1368.1786147093353,513.1381897525904],[1281.3809404711176,646.9883016940971],[652.0994328245271,327.63660761688624],[1140.5160077531893,683.7817047161205],[776.0965800073741,1630.2417245463091],[181.94865962024653,1760.3690093266691],[685.1289353498055,2150.6945732105764],[1557.175050362796,433.1701173023951],[1317.8234919903105,97.27309075118033],[1222.1235929100396,124.661617222804],[621.658112682646,1548.4590128420223],[1428.609234959867,239.8005653569471],[1047.950438715649,65.84472045496288],[859.782820760637,457.64925189539736],[51.280500458159544,480.8888270204398],[1052.5318198119392,821.599722962404],[1261.0457181381978,1266.4456640016483],[1212.544626394944,436.3994822176026],[228.644869577489,362.819826068246],[36.9883148876433,843.1432226935833],[1512.4171403386752,659.6025977372925],[1302.8260948848153,804.6258913540927],[922.1100170729285,508.0895844358626],[1092.549691499543,1121.4836029518642],[187.10842600941206,1225.8495171862278],[579.552781829904,2120.9314775835837],[1662.8903781482563,1913.0627807278686],[679.4665150107197,1577.3088815640347],[584.1239713750355,1982.4944698785725],[911.1156227931181,477.9617292802805],[64.11145672909628,1355.6614230177436]] as vec2[]}
const res = tesselateSurface(set.width, set.height, 0, 0, set.sites);

console.log(res.length)