
import { FileNode, FileType } from '../types';
import JSZip from 'jszip';

/**
 * 触发浏览器下载
 */
const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * 下载单个文件
 */
export const downloadSingleFile = (node: FileNode) => {
  if (node.type !== FileType.FILE) return;
  
  const content = node.content || '';
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, node.name);
};

/**
 * 递归构建 ZIP 目录结构
 */
const addFolderToZip = (zipFolder: JSZip, parentId: string, allFiles: FileNode[]) => {
  // 找到当前文件夹下的所有子节点
  const children = allFiles.filter(f => f.parentId === parentId);

  children.forEach(child => {
    if (child.type === FileType.FILE) {
      // 如果是文件，写入内容
      zipFolder.file(child.name, child.content || '');
    } else {
      // 如果是文件夹，创建子文件夹并递归
      const subFolder = zipFolder.folder(child.name);
      if (subFolder) {
        addFolderToZip(subFolder, child.id, allFiles);
      }
    }
  });
};

/**
 * 打包下载文件夹 (ZIP)
 */
export const downloadFolderAsZip = async (folderNode: FileNode, allFiles: FileNode[]) => {
  if (folderNode.type !== FileType.FOLDER) return;

  const zip = new JSZip();
  // 从根开始递归添加
  // 注意：我们直接把当前选中的文件夹内容放在 ZIP 的根目录下
  // 或者创建一个包含该文件夹名的根目录，这里选择直接放根目录下方便查看，
  // 但为了保留结构语义，通常在ZIP里包一层同名文件夹比较好。
  // 这里逻辑：ZIP包名为 folderName.zip，解压后是 folderName/xxx
  
  const rootFolder = zip.folder(folderNode.name);
  if (rootFolder) {
    addFolderToZip(rootFolder, folderNode.id, allFiles);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `${folderNode.name}.zip`);
};

/**
 * 导出整个项目
 */
export const downloadProjectAsZip = async (projectName: string, allFiles: FileNode[]) => {
    const zip = new JSZip();
    // 根目录下的文件/文件夹 parentId 为 'root'
    addFolderToZip(zip, 'root', allFiles);
    
    const content = await zip.generateAsync({ type: 'blob' });
    triggerDownload(content, `${projectName}.zip`);
};
