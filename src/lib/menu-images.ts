// Ready-made AI food photos shipped with the app (public/menu/*.jpg).
// The menu manager's photo picker offers these first so every item gets a
// beautiful, consistent photo without anyone needing to photograph anything.
export interface MenuImage {
  file: string // file name under /menu/ without extension
  label: string
}

export const MENU_IMAGES: MenuImage[] = [
  { file: 'cold-coffee', label: 'Cold Coffee' },
  { file: 'masala-chai', label: 'Masala Chai' },
  { file: 'popcorn-butter', label: 'Butter Popcorn' },
  { file: 'popcorn-salted', label: 'Salted Popcorn' },
  { file: 'nachos-cheese', label: 'Nachos & Cheese' },
  { file: 'samosa', label: 'Samosa' },
  { file: 'filter-coffee', label: 'Filter Coffee' },
  { file: 'gulab-jamun', label: 'Gulab Jamun' },
  { file: 'kaju-katli', label: 'Kaju Katli' },
  { file: 'rasmalai', label: 'Rasmalai' },
  { file: 'pizza-farmhouse', label: 'Farmhouse Pizza' },
  { file: 'pizza-margherita', label: 'Margherita' },
  { file: 'pizza-paneer-tikka', label: 'Paneer Tikka Pizza' },
  { file: 'garlic-bread', label: 'Garlic Bread' },
  { file: 'peri-peri-fries', label: 'Peri Peri Fries' },
  { file: 'momo', label: 'Momo' },
  { file: 'wrap-chicken-seekh', label: 'Chicken Seekh Wrap' },
  { file: 'wrap-paneer-tikka', label: 'Paneer Tikka Wrap' },
  { file: 'wrap-veg-burrito', label: 'Veg Burrito' },
]
