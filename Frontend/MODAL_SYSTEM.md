# Modal & Toast System

This document describes the new modal and toast notification system that replaces browser native `alert()` and `confirm()` dialogs.

## Components Created

### 1. **Modal** (`src/components/Modal.tsx`)
A reusable base modal component with:
- Backdrop blur effect
- ESC key to close
- Click outside to close
- Smooth animations
- Customizable sizes (sm, md, lg, xl)

### 2. **ConfirmDialog** (`src/components/ConfirmDialog.tsx`)
A confirmation dialog with:
- 4 variants: info, warning, danger, success
- Custom title and message
- Custom button text
- Loading state support
- Icons for each variant

### 3. **Toast** (`src/components/Toast.tsx`)
Toast notifications with:
- 4 types: success, error, warning, info
- Auto-dismiss after 5 seconds (customizable)
- Manual close button
- Slide-in animation
- Stacks vertically

### 4. **ToastContext** (`src/contexts/ToastContext.tsx`)
Global toast management:
- `showToast(message, type)` - Generic toast
- `showSuccess(message)` - Success toast
- `showError(message)` - Error toast
- `showWarning(message)` - Warning toast
- `showInfo(message)` - Info toast

### 5. **useConfirm Hook** (`src/hooks/useConfirm.tsx`)
Easy-to-use confirmation hook:
```tsx
const { confirm, ConfirmDialogComponent } = useConfirm();

// In your component JSX
<ConfirmDialogComponent />

// Use it
const confirmed = await confirm({
  title: 'Delete Item',
  message: 'Are you sure you want to delete this?',
  variant: 'danger',
});

if (confirmed) {
  // Do something
}
```

## Usage Examples

### Toast Notifications

```tsx
import { useToast } from '../../contexts/ToastContext';

function MyComponent() {
  const { showSuccess, showError, showWarning, showInfo } = useToast();

  const handleSave = async () => {
    try {
      await saveData();
      showSuccess('Data saved successfully!');
    } catch (err) {
      showError('Failed to save data');
    }
  };

  return <button onClick={handleSave}>Save</button>;
}
```

### Confirmation Dialogs

**Method 1: Using useConfirm hook (Recommended)**
```tsx
import { useConfirm } from '../../hooks/useConfirm';

function MyComponent() {
  const { confirm, ConfirmDialogComponent } = useConfirm();

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Goal',
      message: 'Are you sure you want to delete this goal?',
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (confirmed) {
      // Delete logic
    }
  };

  return (
    <>
      <button onClick={handleDelete}>Delete</button>
      <ConfirmDialogComponent />
    </>
  );
}
```

**Method 2: Using state (More control)**
```tsx
import ConfirmDialog from '../../components/ConfirmDialog';

function MyComponent() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');

  const handleDelete = () => {
    setConfirmMessage('Are you sure you want to delete this?');
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    // Delete logic
    setConfirmOpen(false);
  };

  return (
    <>
      <button onClick={handleDelete}>Delete</button>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Item"
        message={confirmMessage}
        variant="danger"
      />
    </>
  );
}
```

### Custom Modal

```tsx
import Modal from '../../components/Modal';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open Modal</button>
      <Modal 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)}
        title="My Custom Modal"
        size="lg"
      >
        <div className="p-6">
          <p>Your custom content here</p>
        </div>
      </Modal>
    </>
  );
}
```

## Variants

### ConfirmDialog Variants
- **info** - Blue theme, for informational confirmations
- **warning** - Amber theme, for cautionary actions
- **danger** - Red theme, for destructive actions
- **success** - Green theme, for positive confirmations

### Toast Types
- **success** - Green, for successful operations
- **error** - Red, for errors and failures
- **warning** - Amber, for warnings
- **info** - Blue, for general information

## Files Updated

1. ✅ `Frontend/src/App.tsx` - Wrapped with ToastProvider
2. ✅ `Frontend/src/main.tsx` - Uses AppWithProviders
3. ✅ `Frontend/src/index.css` - Added animations
4. ✅ `Frontend/src/pages/student/bookings.tsx` - Uses ConfirmDialog & Toast
5. ✅ `Frontend/src/pages/student/cart.tsx` - Uses Toast
6. ✅ `Frontend/src/pages/student/goals.tsx` - Uses useConfirm & Toast

## Migration Guide

Replace all instances of:

**Old:**
```tsx
alert('Success!');
alert('Error occurred');
```

**New:**
```tsx
showSuccess('Success!');
showError('Error occurred');
```

**Old:**
```tsx
if (confirm('Are you sure?')) {
  // do something
}
```

**New:**
```tsx
const confirmed = await confirm({
  message: 'Are you sure?',
  variant: 'warning',
});

if (confirmed) {
  // do something
}
```

## Benefits

✅ **Better UX** - Professional, consistent modals across the app  
✅ **Customizable** - Full control over appearance and behavior  
✅ **Accessible** - Keyboard navigation (ESC to close)  
✅ **Responsive** - Works on all screen sizes  
✅ **Type-safe** - Full TypeScript support  
✅ **Async Support** - Confirmation dialogs return promises  
✅ **Loading States** - Built-in loading indicators  
✅ **Auto-dismiss** - Toasts automatically disappear  
✅ **Stacking** - Multiple toasts stack nicely  

## TODO

Files still using `alert()` or `confirm()`:
- `Frontend/src/pages/tutor/content-library.tsx`
- `Frontend/src/pages/tutor/recurring-templates.tsx`
- `Frontend/src/pages/tutor/kyc-upload.tsx`
- `Frontend/src/components/RescheduleModal.tsx`
- `Frontend/src/components/BuyTokensButton.tsx`
- `Frontend/src/pages/student/favorites.tsx`
- `Frontend/src/pages/student/checkout.tsx`
- `Frontend/src/pages/student/certificates.tsx`

These can be migrated following the same pattern used in the updated files.
