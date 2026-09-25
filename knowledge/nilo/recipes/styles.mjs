export const recipeStyles=['storybook','illustrated','realistic']
export function requestedRecipeStyle(text=''){
 const value=String(text).toLowerCase(),hits=[]
 const terms={storybook:/可爱(?:风)?|萌系|卡通(?:风)?|圆圆的|圆一点|简单(?:一)?点|\bcute\b|\bcartoon\b|\bstorybook\b|\bsimpler\b|\brounder\b/g,illustrated:/精美(?:风)?|精致(?:风)?|细腻(?:风)?|装饰(?:风)?|细节多(?:一)?点|多(?:一)?点细节|漂亮(?:一)?点|\billustrated\b|\bdetailed\b|\bdecorative\b|\bmore detail\b/g,realistic:/写实(?:风)?|真实(?:风)?|素描(?:风)?|像真的(?:一样)?|\brealistic\b|\bnaturalistic\b|\blike (?:a )?real\b/g}
 for(const [style,pattern] of Object.entries(terms))for(const match of value.matchAll(pattern)){
  const before=value.slice(Math.max(0,match.index-14),match.index)
  if(/(?:不要|不想要|别用|不是|不用|不要用|not|no|without)\s*$/.test(before))continue
  hits.push({style,index:match.index})
 }
 return hits.sort((a,b)=>b.index-a.index)[0]?.style
}
export function compareRecipeStyle(a,b,preferred){
 return preferred?Number(b.style===preferred)-Number(a.style===preferred):0
}
