import { useId } from 'react'
import atlas from '@/assets/images/nilo/nilo-puppet-atlas.png'

// The sprite atlas is clipped at each painted silhouette, never color-blended
// with the scenery. One decoded image keeps expression changes instant.
const headOutline = 'M58 207C34 195 37 162 55 152Q72 142 87 150Q117 109 164 94L180 79L179 91Q209 66 246 69L254 73L232 84Q266 81 282 93L257 96Q321 109 359 187Q383 181 395 202C410 228 394 251 367 254C365 303 343 330 300 349C238 380 143 374 91 347Q48 325 45 281Q39 247 58 207Z'
const parts = {
  open: { box: '15 60 390 320', path: headOutline, offset: 0 },
  closed: { box: '432 60 390 320', path: headOutline, offset: 417 },
  delighted: { box: '849 60 390 320', path: headOutline, offset: 834 },
  body: { box: '42 430 336 380', path: 'M110 438Q102 443 105 464L101 492C82 533 57 592 50 640Q40 702 79 752L86 762Q51 768 56 790C58 807 83 807 98 802Q122 813 148 798L157 761Q198 770 239 761L247 789C251 805 275 812 289 804Q312 813 333 802C350 791 341 777 328 768L326 748Q369 735 367 704L366 675Q373 661 362 640L337 610Q331 550 299 498L297 463Q303 443 287 443C231 459 173 456 110 438Z' },
  holding: { box: '494 474 274 284', path: 'M501 510Q515 486 542 479C575 467 603 486 616 520L638 560Q651 589 690 605C742 623 763 654 762 697Q762 737 729 750Q692 761 647 738C596 714 571 675 553 628L540 574Q520 578 514 549Q493 548 501 510Z' },
  hand: { box: '875 488 331 246', path: 'M881 544C886 510 918 484 948 497Q986 510 1008 559C1024 598 1059 625 1108 633Q1127 631 1139 617Q1158 608 1165 621Q1171 638 1157 649L1183 653Q1205 652 1202 670Q1202 680 1188 683Q1203 689 1194 703L1173 713Q1179 728 1158 729C1119 731 1104 720 1073 717C1010 716 956 703 923 670Q871 621 881 544Z' },
  tail: { box: '35 940 373 191', path: 'M43 981Q52 943 79 946C109 946 142 978 187 995Q235 1014 281 1001C330 988 353 958 381 947Q407 936 404 965C399 1024 353 1051 307 1074C242 1106 167 1135 106 1120Q53 1109 40 1064Q31 1027 43 981Z' },
  lantern: { box: '526 810 202 371', path: 'M568 924C540 890 562 832 593 819C643 796 681 830 690 865Q707 908 669 929L670 941L699 956L699 969C733 1014 731 1068 709 1104L694 1128L696 1142L702 1147L702 1164Q628 1187 552 1167L552 1149L564 1141L562 1126C523 1091 518 1026 543 986L556 968L554 956L587 940L587 928ZM583 911Q613 895 667 912C691 879 668 826 634 824C592 818 557 878 583 911Z' },
  scarf: { box: '871 887 350 258', path: 'M879 894Q884 886 896 894C927 910 953 919 986 931Q1018 921 1041 940Q1076 926 1129 948L1187 968Q1176 994 1142 1012C1163 1041 1193 1059 1216 1087Q1209 1104 1165 1111L1181 1126L1130 1112L1133 1140C1065 1137 1033 1103 1028 1028L1010 994Q977 1036 926 1033L886 1020Q870 998 878 971Q871 928 879 894Z' },
} as const

export type NiloSpritePart = keyof typeof parts
export function NiloSprite({ part, className = '' }: { part: NiloSpritePart; className?: string }) {
  const id = useId().replace(/:/g, '')
  const sprite = parts[part]
  const [x, y, width, height] = sprite.box.split(' ').map(Number)
  return <svg className={`nilo-painted-part ${className}`} viewBox={sprite.box} aria-hidden="true" focusable="false">
    <defs><mask id={id} maskUnits="userSpaceOnUse" x={x} y={y} width={width} height={height} style={{ maskType: 'luminance' }}>
      <path d={sprite.path} transform={'offset' in sprite ? `translate(${sprite.offset} 0)` : undefined} fill="white" fillRule="evenodd" stroke="black" strokeWidth="3" strokeLinejoin="round" />
    </mask></defs>
    <image href={atlas} width="1254" height="1254" mask={`url(#${id})`} />
  </svg>
}
