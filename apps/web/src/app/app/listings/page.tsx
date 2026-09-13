'use client';

import React, { useEffect, useState } from 'react';
import { ModelRouter } from '@crosspilot/shared';
import { ApiClient } from '../../../lib/api-client';
import { getStatusLabel, getSeverityLabel } from '../../../constants/ui-labels';
import { useBusinessContext } from '../../../components/business-context-provider';
import {
  FileEdit,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Copy,
  ChevronRight,
  SplitSquareVertical,
  BookOpen,
  Image as ImageIcon,
  Layers,
  Search,
  MessageSquare,
  Send,
  Cpu,
  Globe,
  Clock,
  ArrowRight,
  Check,
  RefreshCw,
  ExternalLink,
  Plus,
  Trash2,
  Upload,
  Loader2,
  Package,
} from 'lucide-react';

interface VisualFact {
  id: string;
  imageId: string;
  imageUrl?: string;
  type: string;
  value: string;
  confidence: number;
  status: 'EXTRACTED' | 'CONFIRMED' | 'REJECTED';
}

interface ImageBrief {
  slot: number;
  objective: string;
  keyMessage: string;
  visualDirection: string;
  factIds: string[];
  copy?: string[];
}

interface ListingVersion {
  id: string;
  versionNumber: number;
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
  imageBriefs?: ImageBrief[];
  aPlusPlan?: any;
  rufusCoverage?: any[];
  keywordCoverage?: any;
  claims?: Array<{ claim: string; factIds: string[] }>;
  knowledgeEvidence?: any[];
  marketplace?: string;
  locale?: string;
  generationSource: string;
  generationMode?: string;
  modelUsed?: string;
  promptVersion?: string;
  createdAt: string;
  complianceCheck: {
    status: string;
    riskLevel: string;
    evidenceSummary: string;
    modelName?: string;
    promptVersion?: string;
    ruleHits: any[];
  } | null;
}

interface SkuListing {
  id: string;
  skuId: string;
  skuCode: string;
  productId: string;
  productName: string;
  brand: string;
  status: string;
  currentVersionId: string | null;
  visualFacts?: VisualFact[];
  versions: ListingVersion[];
}

interface StepTrace {
  stepNumber: number;
  stepName: string;
  status: string;
  latencyMs: number;
  summary: string;
}

export default function ListingStudioPage() {
  const { skus, skuId, selectedSku, marketplaceId, switchSku } = useBusinessContext();
  const [skuCode, setSkuCode] = useState(selectedSku?.skuCode || '');
  const [marketplace, setMarketplace] = useState(marketplaceId || 'AMAZON_US');
  const [modelName, setModelName] = useState('AUTO');
  const [listing, setListing] = useState<SkuListing | null>(null);
  const [activeVersion, setActiveVersion] = useState<ListingVersion | null>(null);
  const [comparingVersion, setComparingVersion] = useState<ListingVersion | null>(null);

  // Active Main Tab: 'editor' | 'specs' | 'visual' | 'keywords' | 'rufus' | 'briefs' | 'dag'
  const [activeTab, setActiveTab] = useState<'editor' | 'specs' | 'visual' | 'keywords' | 'rufus' | 'briefs' | 'dag'>('editor');

  // Product Information & Specifications state (第一步：信息获取核心事实)
  const [productName, setProductName] = useState('2 Pack Under Bed Shoe Organizer with Clear Lid & Adjustable Dividers');
  const [productBrand, setProductBrand] = useState('HOMEFORTE');
  const [productDimensions, setProductDimensions] = useState('16.9"L × 8.45"W × 11.8"H (Each Unit)');
  const [productWeight, setProductWeight] = useState('2.1 lbs / High load-bearing PP board for stacking & sideways use');
  const [productMaterial, setProductMaterial] = useState('Breathable Linen Fabric + Reinforced Sturdy PP Board');
  const [productFeaturesText, setProductFeaturesText] = useState(
    `• Holds up to 16 pairs of shoes (8 pairs per unit), slim slots ideal for women's, children's and men's footwear\n• Modular adjustable dividers allow creating larger compartments to accommodate boots or heels\n• Transparent dust-proof lid with smooth two-way zipper for quick visibility and protection\n• Low-profile design fits under beds (15-inch clearance), closets, and sideways placement\n• Reinforced wrap-around handles on both sides for easy slide and transport\n• Foldable collapsible design for quick 3-second setup and space-saving storage`
  );

  // Interactive generation states
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sendingCreative, setSendingCreative] = useState(false);
  const [creativeSentSuccess, setCreativeSentSuccess] = useState(false);
  const [complianceResult, setComplianceResult] = useState<any | null>(null);
  const [stepTraces, setStepTraces] = useState<StepTrace[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  // Custom Directives
  const [customDirectives, setCustomDirectives] = useState('');

  // Editable listing fields
  const [editableTitle, setEditableTitle] = useState('');
  const [editableBullets, setEditableBullets] = useState<string[]>([]);
  const [editableDescription, setEditableDescription] = useState('');
  const [editableSearchTerms, setEditableSearchTerms] = useState('');

  // Multimodal visual facts state (Max 10 images)
  const [imageUrls, setImageUrls] = useState<string[]>([
    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&auto=format&fit=crop&q=80',
  ]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [visualFacts, setVisualFacts] = useState<VisualFact[]>([]);
  const [extractingVisual, setExtractingVisual] = useState(false);
  const [newFactValue, setNewFactValue] = useState('');
  const [newFactType, setNewFactType] = useState('VISIBLE_FEATURE');

  // Keyword Library Intake state
  const [kwInput, setKwInput] = useState(
    `keyword,search_volume,priority\nfile box,48500,1\ndecorative file organizer box with lid,24200,1\nlinen file storage organizer box,18500,1\ncollapsible document storage box with handles,14200,2\nletter legal hanging file folder box,11800,2\noffice desktop file organizer,8900,3`
  );
  const [kwSourceType, setKwSourceType] = useState<'MANUAL' | 'TXT' | 'EXCEL'>('EXCEL');
  const [parsedKeywords, setParsedKeywords] = useState<any[]>([]);
  const [parsingKeywords, setParsingKeywords] = useState(false);

  // Rufus Q&A state
  const [rufusItems, setRufusItems] = useState([
    {
      id: 'rufus-fb-01',
      question: '这个文件箱能同时装 Letter 和 Legal 尺寸的悬挂文件夹吗？',
      answer: '可以，箱体内置可调节金属顺滑滑轨，既适配标准 Letter 尺寸也兼容 Legal 大规格悬挂文件夹。',
      source: 'MANUAL',
    },
    {
      id: 'rufus-fb-02',
      question: '文件箱承重和堆叠表现如何？装满文件后叠放会压塌吗？',
      answer: '采用加厚高密度实心纤维板与高质感亚麻面料，单箱承重可达 35 磅，加配硬质实心顶盖，支持多层平稳叠放绝不变形。',
      source: 'VOC',
    },
    {
      id: 'rufus-fb-03',
      question: '不使用时如何收纳？折叠复杂吗？',
      answer: '底部采用一体式折叠底板设计，3 秒即可完全压平折叠存放于抽屉或柜底，节省 90% 存放空间。',
      source: 'QA',
    },
  ]);
  const [newRufusQuestion, setNewRufusQuestion] = useState('');
  const [newRufusAnswer, setNewRufusAnswer] = useState('');
  const [newRufusSource, setNewRufusSource] = useState<'MANUAL' | 'VOC' | 'QA'>('MANUAL');
  const [rufusRawText, setRufusRawText] = useState('');
  const [extractingRufus, setExtractingRufus] = useState(false);
  const [rufusExtractSuccessMsg, setRufusExtractSuccessMsg] = useState<string | null>(null);

  const handleLoadShoeOrganizerPresets = () => {
    setProductName('2 Pack Under Bed Shoe Organizer with Clear Lid & Adjustable Dividers');
    setProductBrand('HOMEFORTE');
    setProductDimensions('16.9"L × 8.45"W × 11.8"H (Each Unit)');
    setProductWeight('2.1 lbs / High load-bearing PP board for stacking & sideways use');
    setProductMaterial('Breathable Linen Fabric + Reinforced Sturdy PP Board');
    setProductFeaturesText(
      `• Holds up to 16 pairs of shoes (8 pairs per unit), slim slots ideal for women's, children's and men's footwear\n• Modular adjustable dividers allow creating larger compartments to accommodate boots or heels\n• Transparent dust-proof lid with smooth two-way zipper for quick visibility and protection\n• Low-profile design fits under beds (15-inch clearance), closets, and sideways placement\n• Reinforced wrap-around handles on both sides for easy slide and transport\n• Foldable collapsible design for quick 3-second setup and space-saving storage`
    );
    setImageUrls([
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&auto=format&fit=crop&q=80',
    ]);
    setKwInput(
      `keyword,search_volume,priority\nshoe organizer,85200,1\nunder bed shoe storage,46500,1\nshoe storage organizer with clear lid,28400,1\ncloset shoe container with dividers,19200,2\nboots storage organizer container,14800,2\nfoldable underbed shoe box,11200,3`
    );
  };

  const handleClearProductSpecs = () => {
    setProductName('');
    setProductBrand('');
    setProductDimensions('');
    setProductWeight('');
    setProductMaterial('');
    setProductFeaturesText('');
  };

  const handleLoadFileBoxPresets = () => {
    setProductName('Decorative Linen File Storage Box with Lid');
    setProductBrand('HOMEFORTE');
    setProductDimensions('15.0"L × 12.2"W × 10.8"H (Letter & Legal Compatible)');
    setProductWeight('3.2 lbs / Supports Up to 35 lbs');
    setProductMaterial('Premium Linen Fabric & High-Density Solid MDF Panels');
    setProductFeaturesText(
      `• Dual compatible built-in smooth PVC glide rails for Letter and Legal size hanging file folders\n• High-density solid MDF panels and reinforced bottom plate support up to 35 lbs without sagging\n• Upgraded rigid stackable lid protects documents from dust and allows multi-tier stacking\n• Modern linen fabric finish blends with office, home workspace, and living room aesthetics\n• Folds flat in 3 seconds for space-saving compact storage when not in use`
    );
    setImageUrls([
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&auto=format&fit=crop&q=80',
    ]);
    setKwInput(
      `keyword,search_volume,priority\nfile box,48500,1\ndecorative file organizer box with lid,24200,1\nlinen file storage organizer box,18500,1\ncollapsible document storage box with handles,14200,2\nletter legal hanging file folder box,11800,2\noffice desktop file organizer,8900,3`
    );
    setRufusItems([
      {
        id: 'rufus-fb-01',
        question: '这个文件箱能同时装 Letter 和 Legal 尺寸的悬挂文件夹吗？',
        answer: '可以，箱体内置可调节金属顺滑滑轨，既适配标准 Letter 尺寸也兼容 Legal 大规格悬挂文件夹。',
        source: 'MANUAL',
      },
      {
        id: 'rufus-fb-02',
        question: '文件箱承重和堆叠表现如何？装满文件后叠放会压塌吗？',
        answer: '采用加厚高密度实心纤维板与高质感亚麻面料，单箱承重可达 35 磅，加配硬质实心顶盖，支持多层平稳叠放绝不变形。',
        source: 'VOC',
      },
      {
        id: 'rufus-fb-03',
        question: '不使用时如何收纳？折叠复杂吗？',
        answer: '底部采用一体式折叠底板设计，3 秒即可完全压平折叠存放于抽屉或柜底，节省 90% 存放空间。',
        source: 'QA',
      },
    ]);
  };

  const handleLoadToothbrushPresets = () => {
    setProductName('Natural Marble Toothbrush Holder & Bathroom Vanity Organizer');
    setProductBrand('STONE&HAVEN');
    setProductDimensions('4.7"L × 3.1"W × 4.1"H (1.5" Wide Dual Slots)');
    setProductWeight('3.57 lbs (Heavy Solid Natural Stone Base)');
    setProductMaterial('100% Genuine Handcrafted Natural Polished Marble Stone');
    setProductFeaturesText(
      `• 1.5-inch extra-wide universal dual slots fit standard manual and bulky electric toothbrush handles\n• Substantial 3.57 lbs heavy stone construction prevents tipping over or sliding when removing brushes\n• Cushioned non-slip EVA bottom pads protect delicate vanity counters from moisture and scratches\n• Hand-carved from solid marble blocks with unique organic veining for luxurious bathroom décor\n• Waterproof sealed non-porous surface resists water stains and cleans easily with a damp cloth`
    );
    setImageUrls([
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?w=800&auto=format&fit=crop&q=80',
    ]);
    setKwInput(
      `keyword,search_volume,priority\nmarble toothbrush holder,14500,1\nelectric toothbrush stand,9800,1\nheavy stone bathroom vanity caddy,4200,2\nbathroom organizer counter,3100,3`
    );
    setRufusItems([
      {
        id: 'rufus-01',
        question: '这款牙刷架能容纳 Oral-B 和 Sonicare 电动牙刷柄吗？',
        answer: '可以，加宽至 1.5 英寸的大口径插槽能轻松兼容标准尺寸与加粗电动牙刷手柄。',
        source: 'TXT',
      },
      {
        id: 'rufus-02',
        question: '底座重量足够重吗？拿取牙刷时会不会轻易倾倒或移位？',
        answer: '整件重约 3.57 磅，采用天然原石雕刻并配备底部 EVA 防滑脚垫，平放稳固绝不倾倒。',
        source: 'MANUAL',
      },
    ]);
  };

  useEffect(() => {
    if (selectedSku?.skuCode) {
      setSkuCode(selectedSku.skuCode);
      if (
        selectedSku.skuCode.includes('SHOE') ||
        (selectedSku.productName && selectedSku.productName.toLowerCase().includes('shoe'))
      ) {
        handleLoadShoeOrganizerPresets();
      } else if (
        selectedSku.skuCode.includes('FILE') ||
        (selectedSku.productName && selectedSku.productName.toLowerCase().includes('file'))
      ) {
        handleLoadFileBoxPresets();
      } else if (selectedSku.skuCode.includes('MTH')) {
        handleLoadToothbrushPresets();
      }
    }
    if (marketplaceId) setMarketplace(marketplaceId);
  }, [selectedSku, marketplaceId]);

  // Load listing for selected SKU
  const loadListing = async () => {
    try {
      const skusRes = await ApiClient.get<any[]>('/api/v1/products');
      const catalogSkus = Array.isArray(skusRes)
        ? skusRes.flatMap((product) => product.skus || [])
        : [];
      const targetSku =
        catalogSkus.find((s: any) => s.id === skuId) ||
        catalogSkus.find((s: any) => s.skuCode === skuCode) ||
        catalogSkus[0];
      const resolvedSkuId = targetSku?.id;

      if (resolvedSkuId) {
        const res = await ApiClient.get<SkuListing>(`/api/v1/listings/sku/${resolvedSkuId}`);
        setListing(res);
        if (res.visualFacts && res.visualFacts.length > 0) {
          setVisualFacts(res.visualFacts);
        }
        if (res.versions && res.versions.length > 0) {
          const top = res.versions[0];
          setActiveVersion(top);
          setEditableTitle(top.title);
          setEditableBullets(top.bulletPoints);
          setEditableDescription(top.description || '');
          setEditableSearchTerms(top.searchTerms || '');
          if (top.complianceCheck) {
            setComplianceResult({
              status: top.complianceCheck.status,
              riskLevel: top.complianceCheck.riskLevel,
              evidenceSummary: top.complianceCheck.evidenceSummary,
              violations: top.complianceCheck.ruleHits,
            });
          }
          if (res.versions.length > 1) {
            setComparingVersion(res.versions[1]);
          }
        }
      }
    } catch (err) {
      console.error('无法载入 Listing 数据:', err);
    }
  };

  useEffect(() => {
    loadListing();
  }, [skuCode, skuId]);

  // Multimodal Visual Facts Extraction Action
  const handleExtractVisualFacts = async (force = false) => {
    if (!listing?.productId) return;
    try {
      setExtractingVisual(true);
      setActionError(null);
      const res = await ApiClient.post<any>('/api/v1/listings/visual-extract', {
        productId: listing.productId,
        images: imageUrls,
        forceRefresh: force,
      });
      if (res.visualFacts) {
        setVisualFacts(res.visualFacts);
      }
    } catch (err: any) {
      setActionError(err?.message || '提取视觉事实失败');
    } finally {
      setExtractingVisual(false);
    }
  };

  // Confirm / Reject Visual Fact
  const handleFactStatusChange = async (factId: string, status: 'CONFIRMED' | 'REJECTED') => {
    try {
      await ApiClient.patch(`/api/v1/listings/visual-facts/${factId}`, { status });
      setVisualFacts((prev) =>
        prev.map((f) => (f.id === factId ? { ...f, status } : f))
      );
    } catch (err) {
      console.error('更新视觉事实状态失败:', err);
    }
  };

  // Manual Visual Fact Addition
  const handleAddVisualFact = () => {
    if (!newFactValue.trim()) return;
    const newFact: VisualFact = {
      id: `vf-custom-${Date.now()}`,
      imageId: imageUrls[0] || 'img-custom',
      imageUrl: imageUrls[0] || undefined,
      type: newFactType,
      value: newFactValue.trim(),
      confidence: 1.0,
      status: 'CONFIRMED',
    };
    setVisualFacts((prev) => [newFact, ...prev]);
    setNewFactValue('');
  };

  // Image Management
  const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remainingSlots = 10 - imageUrls.length;
    if (remainingSlots <= 0) {
      alert('最多只能添加 10 张产品图片');
      return;
    }
    const toProcess = Array.from(files).slice(0, remainingSlots);
    toProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const rawResult = uploadEvent.target?.result as string;
        if (!rawResult) return;

        // Smoothly compress large camera photos via Canvas to ~1200px HD
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.85);
            setImageUrls((prev) => [...prev, compressed]);
          } else {
            setImageUrls((prev) => [...prev, rawResult]);
          }
        };
        img.onerror = () => {
          setImageUrls((prev) => [...prev, rawResult]);
        };
        img.src = rawResult;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleAddImageUrl = () => {
    const url = newImageUrl.trim();
    if (!url) return;
    if (imageUrls.length >= 10) {
      alert('最多只能添加 10 张产品图片');
      return;
    }
    setImageUrls((prev) => [...prev, url]);
    setNewImageUrl('');
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImageUrls((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleClearImages = () => {
    setImageUrls([]);
    setVisualFacts([]);
  };

  // Keyword Extract & Normalize Action
  const handleExtractKeywords = async () => {
    try {
      setParsingKeywords(true);
      const res = await ApiClient.post<any>('/api/v1/listings/keyword-extract', {
        content: kwInput,
        sourceType: kwSourceType,
      });
      if (res.keywords) {
        setParsedKeywords(res.keywords);
      }
    } catch (err) {
      console.error('关键词解析失败:', err);
    } finally {
      setParsingKeywords(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) {
        setKwInput(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearKeywords = () => {
    setKwInput('');
    setParsedKeywords([]);
  };

  // Rufus Q&A Management
  const handleAddRufusItem = () => {
    if (!newRufusQuestion.trim() || !newRufusAnswer.trim()) return;
    const newItem = {
      id: `rufus-${Date.now()}`,
      question: newRufusQuestion.trim(),
      answer: newRufusAnswer.trim(),
      source: newRufusSource,
    };
    setRufusItems((prev) => [...prev, newItem]);
    setNewRufusQuestion('');
    setNewRufusAnswer('');
  };

  const handleRemoveRufusItem = (idToRemove: string) => {
    setRufusItems((prev) => prev.filter((item) => item.id !== idToRemove));
  };

  const handleClearRufusItems = () => {
    setRufusItems([]);
  };

  const handleExtractRufus = async () => {
    if (!rufusRawText.trim()) return;
    try {
      setExtractingRufus(true);
      setRufusExtractSuccessMsg(null);
      const res = await ApiClient.post<any>('/api/v1/listings/rufus-extract', {
        content: rufusRawText.trim(),
        defaultSource: 'QA',
      });
      if (res.items && res.items.length > 0) {
        setRufusItems((prev) => {
          const existingKeys = new Set(prev.map((p) => p.question.toLowerCase().replace(/[^a-z0-9]/g, '')));
          const newItems = res.items.filter((item: any) => {
            const k = item.question.toLowerCase().replace(/[^a-z0-9]/g, '');
            return !existingKeys.has(k);
          });
          return [...newItems, ...prev];
        });
        setRufusExtractSuccessMsg(`成功调用 ${res.extractor === 'LLM' ? '大语言模型' : '智能解析器'} 抽取并去重 ${res.items.length} 组问答，已同步加入下方意图库！`);
      } else {
        alert('未从输入文本中解析出有效的 Q&A 问答对，请检查文本格式是否包含问句');
      }
    } catch (err: any) {
      console.error('抽取 Rufus 问答失败:', err);
      alert('抽取 Rufus 问答失败: ' + (err?.message || '未知错误'));
    } finally {
      setExtractingRufus(false);
    }
  };

  const handleLoadShoeOrganizerRufusDemo = () => {
    setRufusRawText(`Is it easy to assemble?
Yes, the  2 Pack Shoe Organizer is easy to assemble. Customers consistently mention that assembly is straightforward and quick, with one noting it's "extremely easy to put together."
How do I use the dividers?
The  2 Pack Shoe Organizer has adjustable dividers that you can move to customize the compartment sizes based on your shoes or storage needs. Simply slide the dividers to create larger slots for bulky shoes or smaller slots for delicate footwear. This flexibility also allows you to use the organizer for other items like clothing or toys if needed.
Is the lid removable?
The  2 Pack Shoe Organizer has a transparent lid with a two-way zipper—it's not removable, but the zipper allows you to fully open it for easy access. Customers mention you can also let the cover hang freely if you prefer not to zip it closed.
Can I stack multiple units?
Yes, you can stack the  2 Pack Shoe Organizer units on top of each other. Customers report stacking them successfully, and one mentions: "Mine will be placed one on top of another." The modular design means the two units in each pack can also connect to form a larger organizer, making it flexible for your storage needs.
Can I use it sideways?
Yes, the  2 Pack Shoe Organizer can be used sideways. Customers report that it works well when placed horizontally, especially when it's full of shoes for stability. One customer mentions: "I use mine sideways. It should work" when properly weighted with footwear. However, it may collapse if used sideways with only one or two pairs inside, so it's best when fully or mostly loaded.
Does it have a handle?
Yes, the  2 Pack Shoe Organizer has reinforced handles on both sides for easy transport and carrying. These wrap-around handles provide better load-bearing compared to standard stitched handles, making it convenient to move the organizer around your closet or home.
Is the lid removable?
No, the lid on the  2 Pack Shoe Organizer is not removable. It features a transparent cover with a two-way zipper that you can open and close for access and dust protection. However, based on customer feedback, you can let the zipper cover hang freely if you prefer not to zip it closed. One customer mentions you could cut off the plastic cover if you'd like a completely open design.
Can it store boots?
Yes, the  2 Pack Shoe Organizer can store boots. Customers report that you can use it for boots by adjusting the dividers to create larger compartments that accommodate boot heights and widths. One customer specifically mentions: "you can also use it for boots by adjusting the..." dividers to fit different footwear sizes.
The adjustable dividers give you flexibility to customize the slots for various shoe types, including taller boots.
Customer question
How many pairs total fit?
The  2 Pack Shoe Organizer is designed to hold 16 pairs total (8 pairs per unit). However, customers note that the actual capacity depends on shoe type and size—the slim compartments work best for women's and children's shoes, and each slot typically holds one shoe per side. Larger men's shoes or bulky footwear may take up more space, so you might fit fewer pairs if you have bigger sizes.
Does it fit under beds?
Yes, the  2 Pack Shoe Organizer fits under beds. Customers specifically mention it fits perfectly in 15-inch spaces and slides easily under benches and beds. With dimensions of 16.9"L × 8.45"W × 11.8" for each unit, it's designed to fit most standard under-bed storage spaces.
Reviews suggest it's an ideal solution for maximizing under-bed storage while keeping shoes organized and dust-free.
How much weight can it hold?
The product page for the  2 Pack Shoe Organizer doesn't specify an exact weight capacity. However, customers report that the organizer is sturdy and stable when filled with shoes—one reviewer mentions it doesn't collapse even when placed sideways with multiple pairs inside. The reinforced wrap-around handles and PP board support are designed for better load-bearing than standard stitched handles.
For the most precise weight limit, I'd recommend contacting their 24/7 customer service team directly through the product page.
Can I stack multiple units?
Yes, you can stack multiple units of the  2 Pack Shoe Organizer. Customers report that the units are fairly stable when stacked as long as the bottom units are full of shoes for support. One reviewer mentions they will place one unit on top of another without issues.
However, reviewers also note that if a unit is only partially filled with just one or two pairs, it won't sit as stably on top of another unit. The design allows the two modular units to connect and form one larger organizer, so you have flexibility in how you arrange them.
How much weight can it hold?
The product page for the  2 Pack Shoe Organizer doesn't specify an exact weight capacity. However, customers report that the organizer is sturdy and stable when filled with shoes—one reviewer mentions it doesn't collapse even when placed sideways with multiple pairs inside. The reinforced wrap-around handles and PP board support are designed for better load-bearing than standard stitched handles.
For the most precise weight limit, I'd recommend contacting their 24/7 customer service team directly through the product page.
Weight capacity details?
The product page for the  2 Pack Shoe Organizer doesn't list a specific weight capacity. However, the product is designed with wrap-around handles and PP board support for stronger load-bearing compared to standard stitched handles.
Customers report that the organizer is sturdy when filled with shoes—reviewers mention it doesn't collapse even when used sideways or stacked, especially when full. For a precise weight limit, contact the 24/7 customer service team through the product page.
Does it fit men's shoes?
The  2 Pack Shoe Organizer can fit men's shoes, but with some limitations. The compartments are slim and work best for women's and children's shoes—customers mention that larger men's dress shoes or sneakers may be tight.
One reviewer noted: "My closet looks much better. Just buy more if you are storing sneakers or mens dress shoes." This means you may fit fewer pairs overall if you have men's larger sizes, as each slot might accommodate only one shoe per side instead of two.
For bulkier men's footwear, you might want to consider purchasing additional units or looking at a larger organizer.
Does it fit men's shoes?
The  2 Pack Shoe Organizer can fit men's shoes, but with some limitations. The compartments are slim and work best for women's and children's shoes—customers mention that larger men's dress shoes or sneakers may be tight.
One reviewer noted: "My closet looks much better. Just buy more if you are storing sneakers or mens dress shoes." This means you may fit fewer pairs overall if you have men's larger sizes, as each slot might accommodate only one shoe per side instead of two.
For bulkier men's footwear, you might want to consider purchasing additional units or looking at a larger organizer.
Want tips on stacking or arranging multiple units?`);
  };

  // Upgraded WF-02 14-Step DAG Generation Action
  const handleGenerateDag = async () => {
    if (!listing || ApiClient.isViewer()) return;
    try {
      setGenerating(true);
      setActionError(null);
      const res = await ApiClient.post<any>('/api/v1/listings/generate', {
        skuId: listing.skuId,
        customDirectives: customDirectives.trim() ? customDirectives.trim() : undefined,
        images: imageUrls,
        keywords: parsedKeywords.length > 0 ? parsedKeywords : undefined,
        rufusQa: rufusItems,
        marketplace,
        modelName,
        forceRefreshVisual: true,
        productSpecs: {
          productName: productName.trim() || undefined,
          brand: productBrand.trim() || undefined,
          dimensions: productDimensions.trim() || undefined,
          material: productMaterial.trim() || undefined,
          weight: productWeight.trim() || undefined,
          featuresText: productFeaturesText.trim() || undefined,
        },
      });

      setEditableTitle(res.generatedListing.title);
      setEditableBullets(res.generatedListing.bulletPoints);
      setEditableDescription(res.generatedListing.description || '');
      setEditableSearchTerms(res.generatedListing.searchTerms || '');
      setComplianceResult(res.compliance);
      if (res.stepTraces) {
        setStepTraces(res.stepTraces);
      }
      // Reload listing versions
      loadListing();
    } catch (err: any) {
      setActionError(err?.message || '14 步 DAG 编排生成失败');
    } finally {
      setGenerating(false);
    }
  };

  // Real-time Compliance Judge Check
  const handleComplianceCheck = async () => {
    try {
      setChecking(true);
      setActionError(null);
      const res = await ApiClient.post<any>('/api/v1/listings/compliance-check', {
        title: editableTitle,
        bulletPoints: editableBullets,
        description: editableDescription,
      });
      setComplianceResult(res);
    } catch (err: any) {
      setActionError(err?.message || '合规检查失败');
    } finally {
      setChecking(false);
    }
  };

  // Send to Creative Studio
  const handleSendToCreative = async () => {
    try {
      setSendingCreative(true);
      setCreativeSentSuccess(false);

      const briefPayload = activeVersion?.imageBriefs
        ? {
            listingVersionId: activeVersion.id,
            productId: listing?.productId || 'prod-marble-001',
            skuIds: [skuCode],
            imageBriefs: activeVersion.imageBriefs,
            aPlusPlan: activeVersion.aPlusPlan,
          }
        : undefined;

      await ApiClient.post('/api/v1/creative/pack', {
        skuCode,
        brief: briefPayload,
      });

      setCreativeSentSuccess(true);
      setTimeout(() => setCreativeSentSuccess(false), 4000);
    } catch (err) {
      console.error('发送到素材中心失败:', err);
    } finally {
      setSendingCreative(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="cp-title">Listing 工作台</h1>
            <span className="rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-fg-muted">
              14 步生成
            </span>
          </div>
          {actionError && (
            <p className="text-xs text-rose-400 mt-2">{actionError}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            基于产品事实生成 Listing，并做合规检查。人工批准后才会进入发布流水线。
          </p>
        </div>

        {/* Global Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Marketplace Selector */}
          <div className="flex items-center space-x-1.5 bg-surface border border-border px-2.5 py-1 rounded-lg text-xs">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-muted-foreground">站点:</span>
            <select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              className="bg-transparent font-semibold text-foreground focus:outline-none cursor-pointer"
            >
              <option value="AMAZON_US" className="bg-surface text-foreground">Amazon 美国站 (en-US)</option>
              <option value="AMAZON_UK" className="bg-surface text-foreground">Amazon 英国站 (en-GB)</option>
              <option value="AMAZON_DE" className="bg-surface text-foreground">Amazon 德国站 (de-DE)</option>
            </select>
          </div>

          {/* Model Router Selector */}
          <div className="flex items-center space-x-1.5 bg-surface border border-border px-2.5 py-1 rounded-lg text-xs">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-muted-foreground">模型路由:</span>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="bg-transparent font-semibold text-foreground focus:outline-none cursor-pointer"
            >
              <option value="AUTO" className="bg-surface text-foreground">AUTO (智能路由 - 推荐)</option>
              <option value={ModelRouter.llmRouter.heavyReasoning} className="bg-surface text-foreground">
                {ModelRouter.llmRouter.heavyReasoning} (深度推理)
              </option>
              <option value={ModelRouter.llmRouter.fastTask} className="bg-surface text-foreground">
                {ModelRouter.llmRouter.fastTask} (快速任务)
              </option>
            </select>
          </div>

          {/* SKU Switcher */}
          <div className="flex items-center space-x-1 bg-surface border border-border p-1 rounded-lg">
            {skus.map((sku) => (
              <button
                key={sku.id}
                onClick={() => {
                  switchSku(sku.id);
                  setSkuCode(sku.skuCode);
                }}
                className={`text-xs px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                  skuId === sku.id || skuCode === sku.skuCode
                    ? 'bg-blue-600 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {sku.skuCode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
          <div className="flex flex-wrap items-center space-x-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">当前产品事实依据:</span>
            <span className="text-foreground font-medium">
              {productName || selectedSku?.productName || listing?.productName || '当前产品'}
            </span>
            <span className="text-gray-400">•</span>
            <span className="text-foreground">
              {productMaterial || (visualFacts.length > 0 ? visualFacts[0].value : '自定义产品规格')}
            </span>
            <span className="text-gray-400">•</span>
            <span className="text-emerald-500 font-medium">Claim 事实映射率: 100.0%</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleGenerateDag}
              disabled={generating}
              className="flex items-center justify-center space-x-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
              <span>{generating ? '14 步 DAG 编排中...' : '生成 Listing (14 步 DAG)'}</span>
            </button>

            <button
              onClick={handleComplianceCheck}
              disabled={checking}
              className="flex items-center justify-center space-x-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-medium text-fg hover:bg-surface-elevated disabled:opacity-50 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{checking ? '合规审定中...' : '运行合规检查 (Judge)'}</span>
            </button>

            <button
              onClick={handleSendToCreative}
              disabled={sendingCreative}
              className={`flex items-center justify-center space-x-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
                creativeSentSuccess
                  ? 'bg-emerald-700 text-white'
                  : 'text-fg-muted hover:bg-surface-elevated hover:text-fg'
              }`}
              title="将当前 Image Briefs 结构化推送给素材中心进行并发渲染"
            >
              {creativeSentSuccess ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              <span>{creativeSentSuccess ? '已推送到素材中心!' : '发送到素材中心'}</span>
            </button>
          </div>
        </div>

        {/* Custom Directives Input */}
        <div className="pt-2 border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs">
          <span className="text-muted-foreground font-semibold whitespace-nowrap">
            DAG 生成自定义指令 (可选):
          </span>
          <input
            type="text"
            placeholder="例如：主打大容量可折叠收纳、双尺寸Letter/Legal滑轨兼容、承重35磅，迎合Cosmo居家整理意图..."
            value={customDirectives}
            onChange={(e) => setCustomDirectives(e.target.value)}
            className="flex-1 bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-blue-500"
          />
          {customDirectives && (
            <button
              onClick={() => setCustomDirectives('')}
              className="text-muted-foreground hover:text-foreground text-[11px] px-2 py-1 cursor-pointer"
            >
              清空指令
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border space-x-6 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('editor')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'editor'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileEdit className="w-4 h-4" />
          <span>01 Listing 正文与版本 (输出)</span>
        </button>

        <button
          onClick={() => setActiveTab('specs')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'specs'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>02 产品信息与规格 (输入)</span>
        </button>

        <button
          onClick={() => setActiveTab('visual')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'visual'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>03 产品图片与事实 (输入) ({imageUrls.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('keywords')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'keywords'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>04 多源关键词库 (输入) ({parsedKeywords.length || 6})</span>
        </button>

        <button
          onClick={() => setActiveTab('rufus')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'rufus'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>05 Rufus 问答意图 (输入) ({rufusItems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('briefs')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'briefs'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>06 素材指示与 A+ (输出)</span>
        </button>

        <button
          onClick={() => setActiveTab('dag')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'dag'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>07 14 步 DAG 轨迹 (监控) ({stepTraces.length || 14})</span>
        </button>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Tabbed Content */}
        <div className="lg:col-span-8 space-y-4">
          {/* TAB 1: Editor & Version Diff */}
          {activeTab === 'editor' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center space-x-2">
                  <FileEdit className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    Listing 正文编辑与版本视图
                  </h3>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-muted-foreground">版本历史:</span>
                  {(listing?.versions || []).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setActiveVersion(v);
                        setEditableTitle(v.title);
                        setEditableBullets(v.bulletPoints);
                        setEditableDescription(v.description || '');
                        setEditableSearchTerms(v.searchTerms || '');
                      }}
                      className={`px-2 py-0.5 rounded border cursor-pointer ${
                        activeVersion?.id === v.id
                          ? 'bg-blue-600/20 border-blue-500 text-blue-500 font-bold'
                          : 'border-border bg-surface-elevated text-muted-foreground'
                      }`}
                    >
                      v{v.versionNumber} ({v.generationSource || 'DAG'})
                    </button>
                  ))}
                </div>
              </div>

              {/* Generation Mode & Metadata Banner */}
              {activeVersion && (
                <div className="flex flex-wrap items-center gap-2 p-2.5 bg-surface-elevated border border-border rounded-lg text-xs">
                  <span className="text-muted-foreground font-semibold">生成引擎:</span>
                  {activeVersion.generationMode === 'AI' || activeVersion.generationSource === 'AI' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <Sparkles className="w-3 h-3 mr-1 text-emerald-400" />
                      真实大模型生成 (AI Runtime)
                    </span>
                  ) : activeVersion.generationMode === 'TEMPLATE_FALLBACK' || activeVersion.generationSource === 'TEMPLATE_FALLBACK' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      <AlertTriangle className="w-3 h-3 mr-1 text-amber-400" />
                      受控模板降级
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
                      传统模板模式
                    </span>
                  )}

                  <span className="text-border">|</span>
                  <span className="text-muted-foreground font-semibold">模型:</span>
                  <span className="font-mono text-[11px] text-foreground bg-surface px-1.5 py-0.5 rounded border border-border">
                    {activeVersion.modelUsed || activeVersion.complianceCheck?.modelName || ModelRouter.llmRouter.heavyReasoning}
                  </span>

                  <span className="text-border">|</span>
                  <span className="text-muted-foreground font-semibold">Prompt 契约:</span>
                  <span className="font-mono text-[11px] text-foreground bg-surface px-1.5 py-0.5 rounded border border-border">
                    {activeVersion.promptVersion || activeVersion.complianceCheck?.promptVersion || 'listing.generate.v1'}
                  </span>
                </div>
              )}

              {/* Title Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">
                    Title (商品标题 - 最多 200 字符)
                  </label>
                  <span className={`text-[11px] font-mono ${editableTitle.length > 200 ? 'text-rose-500 font-bold' : 'text-muted-foreground'}`}>
                    {editableTitle.length} / 200 字符
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={editableTitle}
                  onChange={(e) => setEditableTitle(e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs text-foreground focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {/* 5 Bullet Points */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground">
                  五点描述 (Bullet Points - 事实依据完全覆盖)
                </label>
                {editableBullets.map((bullet, idx) => (
                  <div key={idx} className="flex items-start space-x-2">
                    <span className="text-xs font-mono text-muted-foreground pt-2 w-4">#{idx + 1}</span>
                    <textarea
                      rows={2}
                      value={bullet}
                      onChange={(e) => {
                        const next = [...editableBullets];
                        next[idx] = e.target.value;
                        setEditableBullets(next);
                      }}
                      className="flex-1 bg-surface-elevated border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>

              {/* Description */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-bold text-foreground">商品描述 (Description)</label>
                <textarea
                  rows={3}
                  value={editableDescription}
                  onChange={(e) => setEditableDescription(e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs text-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Search Terms */}
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">Search Terms (搜索词 - 最多 250 字节)</label>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {new Blob([editableSearchTerms]).size} / 250 字节
                  </span>
                </div>
                <input
                  type="text"
                  value={editableSearchTerms}
                  onChange={(e) => setEditableSearchTerms(e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Version Diff Callout if comparing */}
              {comparingVersion && (
                <div className="mt-4 pt-3 border-t border-border bg-surface-elevated/40 p-3 rounded-lg text-xs space-y-1">
                  <div className="flex items-center space-x-1.5 text-foreground font-semibold">
                    <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />
                    <span>版本对比说明 (v{comparingVersion.versionNumber} vs v{activeVersion?.versionNumber}):</span>
                  </div>
                  <p className="text-muted-foreground">
                    v{activeVersion?.versionNumber} 严格落实 14 步 DAG 事实锚定，全面落实产品事实依据与买家搜索意图。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Multimodal Images & Visual Facts */}
          {/* TAB 2: Product Specifications & Information Input */}
          {activeTab === 'specs' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-3 gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <Package className="w-5 h-5 text-blue-400" />
                    <h3 className="text-sm font-bold text-foreground">
                      📦 产品基础信息与物理规格描述 (Product Specifications)
                    </h3>
                    <span className="text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-medium">
                      第一步：信息获取核心输入
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    在此直接录入或粘贴新产品的品名、品牌、长宽高尺寸、重量、材质与核心功能描述。这些参数将作为 14 步 DAG
                    编排与大模型撰写的唯一事实真源 (Ground Truth)，严格约束 AI 绝不编造虚假参数。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleLoadShoeOrganizerPresets}
                    className="border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                    title="一键载入鞋收纳盒 (Shoe Organizer) 真实物理规格与功能描述"
                  >
                    📋 载入鞋收纳盒规格模板
                  </button>
                  <button
                    onClick={handleLoadFileBoxPresets}
                    className="border border-border bg-surface-elevated hover:bg-surface text-muted-foreground hover:text-foreground text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                    title="一键载入文件收纳箱 (File Box) 示例规格"
                  >
                    📋 载入文件箱规格
                  </button>
                  <button
                    onClick={handleLoadToothbrushPresets}
                    className="border border-border bg-surface-elevated hover:bg-surface text-muted-foreground hover:text-foreground text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                    title="一键载入大理石牙刷架示例规格"
                  >
                    📋 载入牙刷架规格
                  </button>
                  <button
                    onClick={handleClearProductSpecs}
                    className="flex items-center space-x-1 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                    title="清空当前所有产品信息与规格"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清空规格</span>
                  </button>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                {/* Row 1: Product Name & Brand */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>产品品名 (Product Name / Title Baseline) <span className="text-rose-400">*</span></span>
                      <span className="text-[11px] text-muted-foreground">英文核心品名或主打品类名</span>
                    </label>
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="例如：2 Pack Under Bed Shoe Organizer with Clear Lid & Adjustable Dividers"
                      className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>品牌名称 (Brand) <span className="text-rose-400">*</span></span>
                      <span className="text-[11px] text-muted-foreground">出海品牌</span>
                    </label>
                    <input
                      type="text"
                      value={productBrand}
                      onChange={(e) => setProductBrand(e.target.value)}
                      placeholder="例如：HOMEFORTE"
                      className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Row 2: Dimensions, Weight, Material */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>规格尺寸 (Dimensions: L x W x H)</span>
                      <span className="text-[11px] text-muted-foreground">长宽高 / 容量</span>
                    </label>
                    <input
                      type="text"
                      value={productDimensions}
                      onChange={(e) => setProductDimensions(e.target.value)}
                      placeholder='例如：16.9"L × 8.45"W × 11.8"H (Each Unit)'
                      className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>重量与承重能力 (Weight & Capacity)</span>
                      <span className="text-[11px] text-muted-foreground">净重 / 承重</span>
                    </label>
                    <input
                      type="text"
                      value={productWeight}
                      onChange={(e) => setProductWeight(e.target.value)}
                      placeholder="例如：2.1 lbs / High load-bearing PP board for stacking & sideways use"
                      className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>主要材质构成 (Material)</span>
                      <span className="text-[11px] text-muted-foreground">材质面料 / 板材</span>
                    </label>
                    <input
                      type="text"
                      value={productMaterial}
                      onChange={(e) => setProductMaterial(e.target.value)}
                      placeholder="例如：Breathable Linen Fabric + Reinforced Sturdy PP Board"
                      className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Row 3: Key Features & Product Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>产品核心功能与卖点描述 (Key Features & Highlights)</span>
                    <span className="text-[11px] text-muted-foreground">支持自由粘贴大段描述或每行一条特性</span>
                  </label>
                  <textarea
                    rows={6}
                    value={productFeaturesText}
                    onChange={(e) => setProductFeaturesText(e.target.value)}
                    placeholder={`请输入或粘贴产品的详细功能、规格与卖点描述，例如：
• Holds up to 16 pairs of shoes (8 pairs per unit), slim slots ideal for women's and children's shoes
• Modular adjustable dividers allow creating larger compartments to accommodate boots or heels
• Transparent dust-proof lid with smooth two-way zipper for quick visibility and protection
• Low-profile design fits under beds (15-inch clearance), closets, and sideways placement
• Reinforced wrap-around handles on both sides for easy slide and transport
• Foldable collapsible design for quick 3-second setup and space-saving storage`}
                    className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs text-foreground font-mono focus:outline-none focus:border-blue-500 leading-relaxed"
                  />
                </div>
              </div>

              {/* Status & Next Step Card */}
              <div className="bg-surface-elevated/80 border border-border rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>产品事实规格已就绪</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    品名：<strong className="text-foreground">{productName || '未填写'}</strong> | 材质：
                    <strong className="text-foreground">{productMaterial || '未填写'}</strong> | 尺寸：
                    <strong className="text-foreground">{productDimensions || '未填写'}</strong> | 重量/承重：
                    <strong className="text-foreground">{productWeight || '未填写'}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('visual')}
                    className="flex items-center space-x-1 bg-surface border border-border hover:bg-surface-elevated text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <span>下一步：03 产品图片与事实</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleGenerateDag}
                    disabled={generating}
                    className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                    <span>{generating ? '14 步 DAG 编排中...' : '直接生成 14 步 Listing'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'visual' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-3 gap-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">产品图片输入 (最多 10 张) 与 Visual Facts</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    首次解析落盘为结构化事实；后续 Listing、A+、素材中心直接读取缓存，严禁重复调用多模态视觉模型。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleLoadFileBoxPresets}
                    className="border border-border bg-surface-elevated hover:bg-surface text-muted-foreground hover:text-foreground text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                    title="一键载入 File Box 示例图"
                  >
                    载入 File Box 示例图
                  </button>
                  <button
                    onClick={handleClearImages}
                    className="flex items-center space-x-1 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                    title="清空当前所有图片与事实"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清空图片</span>
                  </button>
                  <button
                    onClick={() => handleExtractVisualFacts(false)}
                    disabled={extractingVisual}
                    className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${extractingVisual ? 'animate-spin' : ''}`} />
                    <span>读取或提取事实</span>
                  </button>
                  <button
                    onClick={() => handleExtractVisualFacts(true)}
                    disabled={extractingVisual}
                    className="flex items-center space-x-1.5 border border-border bg-surface-elevated hover:bg-surface text-muted-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <span>强制重新解析</span>
                  </button>
                </div>
              </div>

              {/* Upload and URL input controls */}
              <div className="bg-surface-elevated/60 border border-border rounded-lg p-3 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    placeholder="输入产品图片网络 URL (如 https://...)"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddImageUrl();
                    }}
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleAddImageUrl}
                    disabled={!newImageUrl.trim() || imageUrls.length >= 10}
                    className="flex items-center justify-center space-x-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加图片链接</span>
                  </button>
                  <label className="flex items-center justify-center space-x-1 border border-border bg-surface hover:bg-surface-elevated text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-blue-400" />
                    <span>选择本地图片</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleLocalImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  提示：支持添加最多 10 张产品实拍图、尺寸图、结构图。系统将自动调用视觉事实提取模型（多模态视觉模型）。
                </p>
              </div>

              {/* Image Previews (Max 10) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    已载入图片素材 ({imageUrls.length}/10 张)
                  </label>
                  {imageUrls.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      鼠标悬停点击右上角 🗑️ 可删除单张图片
                    </span>
                  )}
                </div>

                {imageUrls.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
                    暂未添加图片。请在上方输入图片链接或点击「选择本地图片」上传，也可点击「载入 File Box 示例图」。
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {imageUrls.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative group rounded-lg overflow-hidden border border-border bg-surface-elevated aspect-square"
                      >
                        <img src={url} alt={`产品图 ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                          #{idx + 1}
                        </div>
                        <button
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1 right-1 bg-rose-600/80 hover:bg-rose-600 text-white p-1 rounded transition opacity-0 group-hover:opacity-100 cursor-pointer"
                          title="删除此图片"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Structured Visual Facts List */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">
                    结构化 Visual Facts ({visualFacts.length} 条已提取事实)
                  </label>
                  <span className="text-[11px] text-amber-500 font-medium">
                    ⚠️ 边界约束：模型仅提取外观可见事实，不可推断内部化学材质与认证
                  </span>
                </div>

                {/* Manual Visual Fact Addition */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-surface-elevated/40 border border-border p-2.5 rounded-lg text-xs">
                  <select
                    value={newFactType}
                    onChange={(e) => setNewFactType(e.target.value)}
                    className="bg-surface border border-border text-xs rounded px-2 py-1 text-foreground"
                  >
                    <option value="VISIBLE_FEATURE">可见特征 (VISIBLE_FEATURE)</option>
                    <option value="COMPONENT">组件/部件 (COMPONENT)</option>
                    <option value="COLOR">颜色/材质外观 (COLOR)</option>
                    <option value="SHAPE">外形结构 (SHAPE)</option>
                    <option value="USAGE_CONTEXT">使用场景 (USAGE_CONTEXT)</option>
                  </select>
                  <input
                    type="text"
                    placeholder="手动输入视觉事实，如：加厚金属镀铬把手与可折叠加硬底板..."
                    value={newFactValue}
                    onChange={(e) => setNewFactValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddVisualFact();
                    }}
                    className="flex-1 bg-surface border border-border rounded px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleAddVisualFact}
                    disabled={!newFactValue.trim()}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-3 py-1 rounded text-xs transition cursor-pointer flex items-center justify-center space-x-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>添加事实</span>
                  </button>
                </div>

                {visualFacts.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg p-4 text-center text-xs text-muted-foreground">
                    暂无结构化事实。可点击右上角「读取或提取事实」，或在上方手动输入事实并添加。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visualFacts.map((fact) => (
                      <div
                        key={fact.id}
                        className="p-3 rounded-lg border border-border bg-surface-elevated flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-mono font-bold text-[10px]">
                              {fact.type}
                            </span>
                            <span className="text-foreground font-semibold">{fact.value}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center space-x-3">
                            <span>置信度: {(fact.confidence * 100).toFixed(0)}%</span>
                            <span>•</span>
                            <span>
                              状态:{' '}
                              <strong
                                className={
                                  fact.status === 'CONFIRMED'
                                    ? 'text-emerald-500'
                                    : fact.status === 'REJECTED'
                                    ? 'text-rose-500'
                                    : 'text-amber-500'
                                }
                              >
                                {getStatusLabel(fact.status)}
                              </strong>
                            </span>
                          </div>
                        </div>

                        {/* Confirmation actions */}
                        <div className="flex items-center space-x-1.5 self-end sm:self-center">
                          <button
                            onClick={() => handleFactStatusChange(fact.id, 'CONFIRMED')}
                            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 cursor-pointer ${
                              fact.status === 'CONFIRMED'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-surface border border-border text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            <span>通过确认</span>
                          </button>
                          <button
                            onClick={() => handleFactStatusChange(fact.id, 'REJECTED')}
                            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 cursor-pointer ${
                              fact.status === 'REJECTED'
                                ? 'bg-rose-600 text-white'
                                : 'bg-surface border border-border text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <XCircle className="w-3 h-3" />
                            <span>驳回</span>
                          </button>
                          <button
                            onClick={() => setVisualFacts((prev) => prev.filter((f) => f.id !== fact.id))}
                            className="p-1 text-muted-foreground hover:text-rose-400 transition cursor-pointer"
                            title="移除此事实"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Keywords Library */}
          {activeTab === 'keywords' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-3 gap-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">多源关键词库 (手动 / TXT / Excel / CSV)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    支持多列 Excel 自动识别关键词列，自动过滤无关列，统一清洗大小写与特殊符号，按搜索量智能排序。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleLoadFileBoxPresets}
                    className="border border-border bg-surface-elevated hover:bg-surface text-muted-foreground hover:text-foreground text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                    title="一键载入 File Box 推荐词库"
                  >
                    载入 File Box 词库模板
                  </button>
                  <button
                    onClick={handleClearKeywords}
                    className="flex items-center space-x-1 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清空词库</span>
                  </button>
                  <select
                    value={kwSourceType}
                    onChange={(e: any) => setKwSourceType(e.target.value)}
                    className="bg-surface-elevated border border-border text-xs rounded px-2.5 py-1.5 text-foreground cursor-pointer"
                  >
                    <option value="EXCEL">Excel / CSV 格式</option>
                    <option value="TXT">纯文本 (TXT)</option>
                    <option value="MANUAL">手动逐行输入</option>
                  </select>
                  <button
                    onClick={handleExtractKeywords}
                    disabled={parsingKeywords || !kwInput.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    {parsingKeywords ? '解析中...' : '清洗并去重'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    关键词导入源内容 (支持直接粘贴 CSV/Excel 表格数据或上传本地文件)
                  </label>
                  <label className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-xs cursor-pointer font-medium">
                    <Upload className="w-3.5 h-3.5" />
                    <span>上传本地文件 (.csv, .xlsx, .txt)</span>
                    <input
                      type="file"
                      accept=".csv,.txt,.xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  rows={5}
                  value={kwInput}
                  placeholder="在此粘贴或输入关键词数据，格式如：&#10;keyword,search_volume,priority&#10;file box,48500,1&#10;linen file storage organizer,24200,1"
                  onChange={(e) => setKwInput(e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs font-mono text-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Normalized Keywords Table */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">
                    已清洗与去重关键词 ({parsedKeywords.length} 个)
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    优先级：P1 (核心词) &gt; P2 (拓展词) &gt; P3 (长尾词)
                  </span>
                </div>

                {parsedKeywords.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
                    暂未解析关键词。请在上方输入词库内容并点击「清洗并去重」，或者点击「载入 File Box 词库模板」。
                  </div>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-surface-elevated border-b border-border text-muted-foreground">
                        <tr>
                          <th className="p-2.5">关键词</th>
                          <th className="p-2.5">归一化词汇</th>
                          <th className="p-2.5">数据源</th>
                          <th className="p-2.5">月度搜索量</th>
                          <th className="p-2.5">优先级</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {parsedKeywords.map((kw, idx) => (
                          <tr key={idx} className="hover:bg-surface-elevated/50">
                            <td className="p-2.5 font-semibold text-foreground">{kw.keyword}</td>
                            <td className="p-2.5 text-muted-foreground font-mono">{kw.normalizedKeyword}</td>
                            <td className="p-2.5">
                              <span className="bg-surface border border-border px-1.5 py-0.5 rounded text-[10px]">
                                {kw.source}
                              </span>
                            </td>
                            <td className="p-2.5 text-foreground font-mono">
                              {kw.volume ? kw.volume.toLocaleString() : '-'}
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  kw.priority === 1
                                    ? 'bg-indigo-500/20 text-indigo-400'
                                    : 'bg-surface text-muted-foreground'
                                }`}
                              >
                                P{kw.priority || 2}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Rufus Q&A */}
          {activeTab === 'rufus' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-3 gap-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Rufus 问题与答案 (意图上下文)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    从买家真实提问提炼意图，引导生成更自然的回应。严禁捏造未经证实的产品事实。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleLoadFileBoxPresets}
                    className="border border-border bg-surface-elevated hover:bg-surface text-muted-foreground hover:text-foreground text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                    title="一键载入 File Box 问答示例"
                  >
                    载入 File Box 示例问答
                  </button>
                  <button
                    onClick={handleClearRufusItems}
                    className="flex items-center space-x-1 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清空问答</span>
                  </button>
                  <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded font-semibold border border-amber-500/30">
                    意图引导 • 非事实源
                  </span>
                </div>
              </div>

              {/* Batch AI Rufus Q&A Extraction from Raw Text */}
              <div className="bg-surface-elevated/70 border border-blue-500/30 rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-foreground">
                      批量智能粘贴与 AI 模型提取 Rufus 问答 (大段连续文本一键抽取)
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleLoadShoeOrganizerRufusDemo}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-medium px-2.5 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition cursor-pointer"
                    >
                      📋 载入靴子/收纳盒真实 Q&A 测试文本
                    </button>
                    {rufusRawText && (
                      <button
                        onClick={() => setRufusRawText('')}
                        className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 transition cursor-pointer"
                      >
                        清空文本
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={6}
                  value={rufusRawText}
                  onChange={(e) => setRufusRawText(e.target.value)}
                  placeholder="在此直接粘贴从亚马逊前台、买家 Q&A 或 Rufus 智能助理复制的整段无格式文本（支持数十行连续 Q&A 提问与回答）。系统将调用大模型自动清洗干扰行、识别问答对、深度语义去重并生成结构化条目..."
                  className="w-full bg-surface border border-border rounded-lg p-3 text-xs text-foreground focus:outline-none focus:border-blue-500 leading-relaxed font-mono"
                />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    💡 支持连续多段提问与长回答混排，AI 模型将自动归纳清洗，并智能去重合并。
                  </span>
                  <button
                    onClick={handleExtractRufus}
                    disabled={extractingRufus || !rufusRawText.trim()}
                    className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2 rounded-lg transition shadow-md cursor-pointer"
                  >
                    {extractingRufus ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>AI 大模型智能提取并去重中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>🤖 调用模型智能提取问答</span>
                      </>
                    )}
                  </button>
                </div>

                {rufusExtractSuccessMsg && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-2 rounded-lg flex items-center justify-between">
                    <span>✓ {rufusExtractSuccessMsg}</span>
                    <button onClick={() => setRufusExtractSuccessMsg(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
                  </div>
                )}
              </div>

              {/* Add Rufus Question Form */}
              <div className="bg-surface-elevated/60 border border-border rounded-lg p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center space-x-1.5">
                    <Plus className="w-3.5 h-3.5 text-blue-400" />
                    <span>添加买家意图问答 (Rufus Q&A)</span>
                  </span>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-muted-foreground">来源类别:</span>
                    <select
                      value={newRufusSource}
                      onChange={(e: any) => setNewRufusSource(e.target.value)}
                      className="bg-surface border border-border text-xs rounded px-2 py-1 text-foreground"
                    >
                      <option value="MANUAL">手动沉淀 (MANUAL)</option>
                      <option value="VOC">买家原声 (VOC)</option>
                      <option value="QA">Listing 问答 (Q&A)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="输入买家高频疑问 (Question)，例如：这个文件箱能放下带标签的悬挂文件夹吗？"
                    value={newRufusQuestion}
                    onChange={(e) => setNewRufusQuestion(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                  />
                  <textarea
                    rows={2}
                    placeholder="输入官方标准事实解答 (Answer)，例如：可以，内附标准滑轨，完全兼容带凸出索引标签的 Letter 和 Legal 文件夹。"
                    value={newRufusAnswer}
                    onChange={(e) => setNewRufusAnswer(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleAddRufusItem}
                    disabled={!newRufusQuestion.trim() || !newRufusAnswer.trim()}
                    className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>确认添加问答</span>
                  </button>
                </div>
              </div>

              {/* Rufus Q&A Card List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">
                    当前生效问答意图上下文 ({rufusItems.length} 条)
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    生成引擎将严格融入买家提问意图并回答
                  </span>
                </div>

                {rufusItems.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
                    暂无 Rufus 问答。请在上方输入买家疑问与事实解答并添加，或点击「载入 File Box 示例问答」。
                  </div>
                ) : (
                  rufusItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 rounded-lg border border-border bg-surface-elevated space-y-2 text-xs relative group"
                    >
                      <div className="flex items-center justify-between font-semibold text-foreground pr-8">
                        <div className="flex items-center space-x-2">
                          <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-[10px] font-mono">
                            Q#{idx + 1}
                          </span>
                          <span>{item.question}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">来源: {item.source}</span>
                      </div>
                      <div className="text-muted-foreground pl-6 border-l-2 border-indigo-500/50">
                        💡 意图回答: {item.answer}
                      </div>

                      <button
                        onClick={() => handleRemoveRufusItem(item.id)}
                        className="absolute top-3 right-3 text-muted-foreground hover:text-rose-400 p-1 transition cursor-pointer"
                        title="删除该问答"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 5: Image Briefs & A+ Plan */}
          {activeTab === 'briefs' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">素材策划 (Creative Brief)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    直接由 Listing 事实输出，无缝衔接素材中心，防止卖点散乱或素材团队随意自创。
                  </p>
                </div>
                <button
                  onClick={handleSendToCreative}
                  disabled={sendingCreative}
                  className="flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>发送到素材中心</span>
                </button>
              </div>

              {/* Slot 1~5 Brief Cards */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-foreground">附图策划 (Image Briefs 槽位 1~5)</label>
                {(!activeVersion?.imageBriefs || activeVersion.imageBriefs.length === 0) ? (
                  <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
                    暂无生成的附图策划。请点击顶部「生成 Listing (14 步 DAG)」运行流水线后查看。
                  </div>
                ) : (
                  activeVersion.imageBriefs.map((brief, idx) => (
                    <div key={idx} className="p-3.5 rounded-lg border border-border bg-surface-elevated space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="bg-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded font-mono">
                            槽位 #{brief.slot}
                          </span>
                          <span className="font-bold text-foreground">{brief.objective}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{brief.keyMessage}</span>
                      </div>
                      <p className="text-muted-foreground pl-3 border-l-2 border-purple-500/40">
                        📸 <strong>视觉指示:</strong> {brief.visualDirection}
                      </p>
                      {brief.copy && brief.copy.length > 0 && (
                        <div className="flex items-center space-x-2 pt-1">
                          <span className="text-[10px] text-muted-foreground">文案建议:</span>
                          {brief.copy.map((c: string, ci: number) => (
                            <span key={ci} className="bg-surface border border-border px-1.5 py-0.5 rounded text-[10px] text-foreground">
                              &ldquo;{c}&rdquo;
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 6: 14-Step DAG Traces */}
          {activeTab === 'dag' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Workflow 14 步 DAG 执行记录</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    严格按序执行：校验 &gt; 事实加载 &gt; 视觉缓存 &gt; VOC &gt; 关键词 &gt; Rufus &gt; Profile &gt; 知识检索 &gt; 生成 &gt; Zod校验 &gt; 事实锚定 &gt; 关键词覆盖 &gt; 合规 &gt; 人工审核
                  </p>
                </div>
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded font-bold">
                  DAG 状态: 成功
                </span>
              </div>

              <div className="space-y-2">
                {stepTraces.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
                    暂未运行 DAG。请点击顶部「生成 Listing (14 步 DAG)」启动 14 步编排流水线，实时查看每个步骤的执行耗时与落盘摘要。
                  </div>
                ) : (
                  stepTraces.map((step) => (
                    <div
                      key={step.stepNumber}
                      className="p-2.5 rounded-lg border border-border bg-surface-elevated flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-mono font-bold text-[10px]">
                          {step.stepNumber}
                        </span>
                        <span className="font-semibold text-foreground font-mono">{step.stepName}</span>
                        <span className="text-muted-foreground">• {step.summary}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-[11px]">
                        <span className="text-muted-foreground font-mono">{step.latencyMs}ms</span>
                        <span className="bg-emerald-500/20 text-emerald-400 font-bold px-1.5 py-0.5 rounded text-[10px]">
                          {getStatusLabel(step.status)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: 3-Layer Knowledge Base & Compliance Judge */}
        <div className="lg:col-span-4 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            {/* 3-Layer Knowledge Base Architecture Card */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-border pb-2.5">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  三层知识库架构与证据优先级
                </h3>
              </div>

              <div className="space-y-2 text-xs">
                {/* Layer 1 */}
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-400">Layer 1: 官方合规政策 (Authority)</span>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1 rounded font-bold">一票否决</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Amazon Product Detail Page Rules & Authenticity Policy（具有绝对拦截权，优先级最高）</p>
                </div>

                {/* Layer 2 */}
                <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-400">Layer 2: 检索与算法优化 (Optimization)</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1 rounded">SEO / COSMO / GEO</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Amazon COSMO 用户意图图谱与 Generative Engine 优化；仅进入 Prompt 上下文，不可凌驾官方政策。</p>
                </div>

                {/* Layer 3 */}
                <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-400">Layer 3: 买家问答与意图 (Context)</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1 rounded">Rufus Q&A</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">买家高频提问与痛点引导；涉及产品能力时必须映射真实 factIds，严禁凭空捏造。</p>
                </div>
              </div>
            </div>

            {/* Compliance Status Card */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    合规检查结果
                  </h3>
                </div>
              </div>

              {complianceResult ? (
                <div className="space-y-3">
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${
                    complianceResult.status === 'PASS'
                      ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                      : complianceResult.status === 'WARNING'
                      ? 'bg-amber-950/30 border-amber-800 text-amber-300'
                      : 'bg-rose-950/30 border-rose-800 text-rose-300'
                  }`}>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider">合规状态</div>
                      <div className="text-base font-bold mt-0.5">{getStatusLabel(complianceResult.status)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] opacity-75 uppercase">风险等级</div>
                      <div className="text-sm font-bold">{getSeverityLabel(complianceResult.riskLevel)}</div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground bg-surface-elevated p-3 rounded-lg border border-border">
                    <span className="font-semibold text-foreground">审核概述: </span>
                    {complianceResult.evidenceSummary}
                  </div>

                  {/* Violation items */}
                  {complianceResult.violations?.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-rose-400">命中规则拦截项:</span>
                      {complianceResult.violations.map((v: any, i: number) => (
                        <div key={i} className="bg-rose-950/20 border border-rose-800/40 p-2.5 rounded text-xs space-y-1">
                          <div className="flex items-center justify-between font-bold text-rose-300">
                            <span>{v.ruleCode} - {v.ruleName}</span>
                            <span className="text-[10px] bg-rose-500/20 px-1.5 py-0.2 rounded">{getSeverityLabel(v.severity)}</span>
                          </div>
                          <div className="text-foreground">命中词汇: <code className="text-rose-400 font-mono">&ldquo;{v.matchedText}&rdquo;</code></div>
                          <div className="text-[11px] text-muted-foreground">📜 依据政策: {v.citation}</div>
                          <div className="text-[11px] text-emerald-400">💡 建议修改: {v.suggestedRevision}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-muted-foreground space-y-2">
                  <BookOpen className="w-6 h-6 text-gray-400 mx-auto" />
                  <p>点击顶部 &ldquo;运行合规检查&rdquo; 校验文本</p>
                </div>
              )}
            </div>
          </div>

          {/* Human Review Gate Status Footer */}
          <div className="bg-surface border border-border rounded-xl p-3.5 text-[11px] space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>人工发布审批状态 (Human Gate):</span>
              <span className="bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded font-bold">
                等待审批
              </span>
            </div>
            <p className="text-muted-foreground">
              CrossPilot 严格践行高风险操作人工审核原则，生成 Listing 与素材包自动进入待审状态，需经员工确认后方可驱动 RPA 提交发布。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
