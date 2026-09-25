// Shared by recipe retrieval and voice editing. Longest overlapping names win:
// 熊猫 is not 猫, 鲸鱼 is not 鱼, cupcake is not cup.
const aliases={
 capybara:['卡皮巴拉','豚豚'],hamster:['仓鼠'],otter:['水獭','水獭宝宝'],hedgehog:['刺猬'],seal:['海豹','海豹宝宝'],redpanda:['小熊猫','红熊猫','red panda','lesser panda'],chick:['小鸡','小鸡仔','鸡仔','chicken','baby chicken'],frog:['青蛙','蛙'],jellyfish:['水母'],axolotl:['六角恐龙','美西螈','蝾螈','墨西哥钝口螈'],snail:['蜗牛'],pudding:['布丁','焦糖布丁'],
 squirrel:['松鼠'],bird:['鸟','小鸟'],boat:['船','小船','划艇','帆船'],bench:['椅子','椅','长凳'],cat:['猫','小猫'],rabbit:['兔','兔子'],fish:['鱼','小鱼'],turtle:['龟','乌龟'],flower:['花','小花'],tree:['树','大树'],house:['房','屋','房子'],umbrella:['伞','雨伞'],
 dog:['狗','狗狗'],bear:['熊'],fox:['狐狸'],lion:['狮子'],elephant:['象'],horse:['马'],pig:['猪'],cow:['牛'],sheep:['羊'],duck:['鸭','鸭子'],whale:['鲸'],crab:['蟹','螃蟹'],palm:['棕榈','椰子树'],rose:['玫瑰花'],sunflower:['太阳花'],bamboo:['竹','竹子'],grass:['草'],sun:['太阳'],moon:['月球'],cloud:['云','白云'],
 car:['小汽车','轿车'],bus:['巴士','校车'],truck:['货车','消防车'],train:['火车','高铁'],airplane:['小飞机','plane','aeroplane'],helicopter:['直升飞机'],bicycle:['单车','脚踏车','bike'],castle:['城堡'],tent:['帐篷'],windmill:['风车'],
 pear:['梨'],cherry:['樱桃'],grapes:['葡萄','grape'],icecream:['冰激凌','ice cream','ice-cream'],cake:['生日蛋糕'],cupcake:['纸杯小蛋糕'],ball:['球','足球','篮球','沙滩球'],drum:['鼓'],book:['书','绘本'],paintpalette:['调色板','palette','paint palette'],wateringcan:['水壶','洒水壶','watering can'],teapot:['茶壶','tea pot'],cup:['茶杯','水杯','马克杯','mug'],clock:['钟','闹钟'],gift:['礼盒','礼物盒','present'],dragon:['龙'],astronaut:['航天员','太空人'],ufo:['不明飞行物','飞船'],
}
export function findRecipeSubjects(text,recipes,exact=false){
 const value=String(text??'').trim().toLowerCase(),hits=[],seen=new Set()
 for(const r of recipes){
  if(seen.has(r.subject))continue
  seen.add(r.subject)
  for(const word of new Set([r.subject,r.name,...(aliases[r.subject]??[]),...(r.aliases??[])])){
   if(exact===true){if(value===word)hits.push({subject:r.subject,start:0,end:value.length});continue}
   let start=value.indexOf(word)
   while(start>=0){
    const end=start+word.length,english=/^[a-z -]+$/.test(word)
    if(!english||(!/[a-z]/.test(value[start-1]??'')&&!/[a-z]/.test(value[end]??'')))hits.push({subject:r.subject,start,end})
    start=value.indexOf(word,start+1)
   }
  }
 }
 return [...new Set(hits.filter(h=>!hits.some(other=>other.start<=h.start&&other.end>=h.end&&(other.end-other.start>h.end-h.start))).map(h=>h.subject))]
}

// The material browser shares the same vocabulary as voice requests.
export function recipeSubjectAliases(subject) { return [...(aliases[subject] ?? [])] }
