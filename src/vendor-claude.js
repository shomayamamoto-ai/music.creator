// Claude の SDK だけをまとめた別ファイル(必要になったときに読み込む)。
import Anthropic from '@anthropic-ai/sdk';

window.__MC_Anthropic = Anthropic;
