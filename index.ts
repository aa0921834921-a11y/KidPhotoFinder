/**
 * App 的進入點。
 * 系統在背景叫醒 App（自動找老師的新照片）時，只會跑到這個檔案、不會打開畫面，
 * 所以背景工作要先在這裡定義好，再載入 App 的畫面。
 */
import './src/services/background';
import 'expo-router/entry';
