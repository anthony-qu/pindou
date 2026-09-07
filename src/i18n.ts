/** Bilingual UI strings. Built in from the start: retrofitting translation
 *  into a finished interface is far more painful than carrying it along. */

export type Lang = 'en' | 'zh'

/** Widened string values, so a component accepts either language rather than
 *  only the English literals that `as const` would otherwise pin it to. */
export type Strings = { [K in keyof (typeof STRINGS)['en']]: string }

export const STRINGS = {
  en: {
    title: 'Pindou',
    tagline: 'Turn an image into a Mard bead chart',
    privacy: 'Runs entirely in your browser. Your image is never uploaded.',
    drop: 'Drop an image here, or click to choose',
    dropHint: 'PNG, JPG, WebP or GIF. Transparent areas become empty holes.',
    canvasSize: 'Canvas size',
    method: 'Detail',
    average: 'Smooth',
    averageHint: 'Averages each cell. Best for photos.',
    sharp: 'Sharp',
    sharpHint: 'Keeps flat colour and hard edges. Best for anime, logos and sprites.',
    view: 'View',
    viewPreview: 'Preview',
    viewChart: 'Chart',
    chartHint: 'Pinch or scroll to zoom. Codes appear as you zoom in.',
    gridSize: 'Grid',
    coloursUsed: 'Colours',
    totalBeads: 'Beads',
    beadList: 'Bead list',
    reset: 'New image',
    badImage: 'That file could not be read as an image.',
    fitNote: 'Aspect ratio is preserved; the image fills the canvas as far as it can.',

    simplifyColours: 'Simplify colors',
    currentColours: 'current number of colors',
    colourCountHint: 'Merges bead codes that look alike, starting with the closest and least-used.',

    workHint: 'One colour isolated. Pick another, or show all.',
    allColours: 'Show all',
    placing: 'Placing',
    darkMode: 'Dark mode',
    lightMode: 'Light mode',

    save: 'Save',
    saved: 'Saved',
    projects: 'Saved projects',
    noProjects: 'Nothing saved yet.',
    open: 'Open',
    remove: 'Delete',
    exportFile: 'Export file',
    importFile: 'Open file',
    storageFull: 'Browser storage is full. Delete a project, or export this one to a file.',
    savedInBrowser: 'Saved in this browser only. Export to a file to keep a copy you control.',
    nameProject: 'Project name',
    untitled: 'Untitled',

    advanced: 'Advanced',
    advancedTitle: 'Advanced conversion',
    advancedIntro: 'Seven settings that visibly change the chart. Defaults reproduce the standard conversion.',
    resetDefaults: 'Reset to defaults',
    done: 'Done',
    modified: 'modified',
    sharpOnly: 'Sharp only',

    kernelLabel: 'Kernel shape',
    kernelHint: 'How source pixels inside a cell are weighted. Box treats a pixel at the cell edge the same as one at its centre; the others fall off with distance, and the last two reach into neighbouring cells and sharpen at the cost of ringing.',
    kernelBox: 'Box', kernelTent: 'Tent', kernelGaussian: 'Gauss',
    kernelMitchell: 'Mitchell', kernelLanczos: 'Lanczos',

    boundaryLabel: 'Boundary handling',
    boundaryHint: 'A cell is rarely a whole number of pixels wide. Snap gives each cell whole pixels, so the odd fraction lands on one side. Exact weights the edge pixels by how much of them the cell really covers.',
    boundarySnap: 'Snap', boundaryExact: 'Exact',

    alphaLabel: 'Alpha threshold',
    alphaHint: 'How much of a cell must be opaque before it becomes a bead. Lower keeps thin features; higher gives a tighter silhouette.',

    binsLabel: 'Bin width',
    binsHint: 'How close two colors must be to count as the same when finding a cell\u2019s dominant color. Wider bins flatten more; narrower bins keep detail but turn to noise on photos.',
    binsUnit: 'levels',

    mergeLabel: 'Bin merging',
    mergeHint: 'Pools each bin with its neighbours before picking the winner, so two near-identical colors split across a bin edge are not both beaten by a third.',
    mergeOff: 'off',
    mergeUnit: 'bins',

    dominanceLabel: 'Dominance threshold',
    dominanceHint: 'How much of a cell the dominant color must cover before Sharp trusts it. Below this the cell is averaged instead, so flat areas stay sharp while gradients stay smooth.',
    dominanceOff: 'off (always dominant)',

    refineLabel: 'Bin refinement',
    refineHint: 'The winning bin\u2019s color: the mean of the pixels in it, which is accurate, or the bin centre, which quantises output to the bin grid and makes the bin width plainly visible.',
    refineMean: 'Mean', refineCentre: 'Bin centre',
  },
  zh: {
    title: '拼豆',
    tagline: '把图片转成 Mard 色号图纸',
    privacy: '全部在你的浏览器里运行，图片不会被上传。',
    drop: '把图片拖到这里，或点击选择',
    dropHint: '支持 PNG、JPG、WebP、GIF。透明区域会留空不放豆。',
    canvasSize: '画布尺寸',
    method: '细节',
    average: '平滑',
    averageHint: '每格取平均色，适合照片。',
    sharp: '锐化',
    sharpHint: '保留大色块和硬边缘，适合动漫、logo、像素图。',
    view: '视图',
    viewPreview: '预览',
    viewChart: '图纸',
    chartHint: '双指或滚轮缩放，放大后显示色号。',
    gridSize: '网格',
    coloursUsed: '色数',
    totalBeads: '豆子',
    beadList: '色号清单',
    reset: '换一张',
    badImage: '这个文件无法作为图片读取。',
    fitNote: '保持原图比例，尽可能填满画布。',

    simplifyColours: '颜色简化',
    currentColours: '当前颜色数',
    colourCountHint: '合并看起来相近的色号，从最接近、用得最少的开始。',

    workHint: '已单独显示一个颜色。可以换一个，或显示全部。',
    allColours: '显示全部',
    placing: '正在拼',
    darkMode: '夜间模式',
    lightMode: '日间模式',

    save: '保存',
    saved: '已保存',
    projects: '已保存的作品',
    noProjects: '还没有保存的作品。',
    open: '打开',
    remove: '删除',
    exportFile: '导出文件',
    importFile: '打开文件',
    storageFull: '浏览器存储已满。请删除一个作品，或把当前作品导出成文件。',
    savedInBrowser: '只保存在这个浏览器里。导出成文件可以自己保管一份。',
    nameProject: '作品名称',
    untitled: '未命名',

    advanced: '高级',
    advancedTitle: '高级转换设置',
    advancedIntro: '七个会明显改变图纸的设置。默认值等于标准转换。',
    resetDefaults: '恢复默认',
    done: '完成',
    modified: '已修改',
    sharpOnly: '仅锐化',

    kernelLabel: '核形状',
    kernelHint: '一格内的源像素如何加权。Box 把边缘像素和中心像素同等对待；其余按距离衰减，最后两种还会伸进相邻格，锐利但会有振铃。',
    kernelBox: 'Box', kernelTent: '三角', kernelGaussian: '高斯',
    kernelMitchell: 'Mitchell', kernelLanczos: 'Lanczos',

    boundaryLabel: '边界处理',
    boundaryHint: '一格的宽度很少是整数个像素。Snap 让每格取整像素，多出的零头整个落到一边；Exact 按实际覆盖比例给边缘像素加权。',
    boundarySnap: '取整', boundaryExact: '精确',

    alphaLabel: 'Alpha 阈值',
    alphaHint: '一格要有多少不透明才放豆子。调低能保留细小结构，调高轮廓更紧凑。',

    binsLabel: '分箱宽度',
    binsHint: '判断一格主色时，两个颜色要多接近才算同一种。分箱越宽越平整；越窄越保留细节，但照片会变成噪点。',
    binsUnit: '级',

    mergeLabel: '分箱合并',
    mergeHint: '选主色之前先把每个箱和邻箱合并，避免两个几乎相同、却被箱边界分开的颜色一起输给第三个。',
    mergeOff: '关',
    mergeUnit: '箱',

    dominanceLabel: '主色占比阈值',
    dominanceHint: '主色要占一格多大比例，锐化才采用它。低于该值就改用平均，于是平色区保持锐利、渐变区保持平滑。',
    dominanceOff: '关（总用主色）',

    refineLabel: '箱内取值',
    refineHint: '获胜箱的颜色取值：箱内像素的平均值更准确；取箱中心则把输出量化到分箱网格上，能直观看出分箱宽度。',
    refineMean: '平均', refineCentre: '箱中心',
  },
} as const
